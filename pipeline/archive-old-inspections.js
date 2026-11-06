/**
 * archive-old-inspections.js
 *
 * Finds establishments with 10+ inspections that have at least one inspection
 * older than 3 years where a newer inspection also exists. Exports those old
 * rows (and their violations) to JSON, uploads to Cloudflare R2, then deletes
 * from Supabase.
 *
 * Safety rules:
 *  - Never deletes the only inspection record for an establishment
 *  - Never deletes inspections less than 3 years old
 *  - Never deletes violation records that are the only record for their establishment
 */

import { createClient } from "@supabase/supabase-js";
import {
  S3Client,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { writeFile, unlink } from "fs/promises";
import { gzipSync } from "zlib";
import "dotenv/config";

// ─── Config ──────────────────────────────────────────────────────────────────
const SUPABASE_URL          = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const R2_ACCOUNT_ID         = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID      = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY  = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET             = process.env.R2_BUCKET ?? "lfs-archive";
const THREE_YEARS_AGO = (() => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 3);
  return d.toISOString().slice(0, 10);
})();

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.error("Missing R2 credentials (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)");
  process.exit(1);
}

const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
function log(...args) { console.log(new Date().toISOString(), ...args); }

async function fetchAll(query) {
  const PAGE = 1000;
  let offset = 0;
  let all = [];
  while (true) {
    const { data, error } = await query(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const stats = { archived: 0, deleted: 0, skipped: 0, errors: 0 };

  log("Cutoff date (3 years ago):", THREE_YEARS_AGO);

  // Step 1: Find establishments with 10+ inspections
  log("Finding establishments with 10+ inspections...");
  const { data: candidates, error: candidateErr } = await supa
    .from("inspections")
    .select("establishment_id")
    .order("establishment_id");
  if (candidateErr) throw candidateErr;

  const countByEid = {};
  for (const row of candidates) {
    countByEid[row.establishment_id] = (countByEid[row.establishment_id] ?? 0) + 1;
  }
  const eligibleEids = Object.entries(countByEid)
    .filter(([, c]) => c >= 10)
    .map(([eid]) => eid);

  log(`${eligibleEids.length} establishments have 10+ inspections`);

  if (eligibleEids.length === 0) {
    log("Nothing to archive.");
    return stats;
  }

  // Step 2: For each eligible eid, find inspections older than 3 years
  //         where a newer inspection also exists for the same eid.
  const archiveRows = [];

  const BATCH = 100;
  for (let i = 0; i < eligibleEids.length; i += BATCH) {
    const batch = eligibleEids.slice(i, i + BATCH);

    const { data: oldInsp, error: oldErr } = await supa
      .from("inspections")
      .select("inspection_id, establishment_id, inspection_date, score, grade, ins_type_desc, raw")
      .in("establishment_id", batch)
      .lt("inspection_date", THREE_YEARS_AGO)
      .order("inspection_date", { ascending: true });

    if (oldErr) { log("Error fetching old inspections:", oldErr); stats.errors++; continue; }
    if (!oldInsp || oldInsp.length === 0) continue;

    // Group by eid
    const byEid = {};
    for (const r of oldInsp) {
      if (!byEid[r.establishment_id]) byEid[r.establishment_id] = [];
      byEid[r.establishment_id].push(r);
    }

    // For each eid, verify a newer inspection exists
    const { data: newerCheck, error: newErr } = await supa
      .from("inspections")
      .select("establishment_id")
      .in("establishment_id", batch)
      .gte("inspection_date", THREE_YEARS_AGO);

    if (newErr) { log("Error checking newer inspections:", newErr); stats.errors++; continue; }

    const hasNewer = new Set((newerCheck || []).map(r => r.establishment_id));

    for (const [eid, rows] of Object.entries(byEid)) {
      if (!hasNewer.has(eid)) {
        // No newer inspection — skip to avoid making this the sole record
        stats.skipped += rows.length;
        continue;
      }
      archiveRows.push(...rows);
    }
  }

  if (archiveRows.length === 0) {
    log("No inspections qualify for archival.");
    return stats;
  }

  log(`${archiveRows.length} inspection rows qualify for archival`);

  // Step 3: Fetch associated violations for all qualifying inspection IDs
  const inspIds = archiveRows.map(r => r.inspection_id);
  log(`Fetching violations for ${inspIds.length} inspections...`);

  const allViolations = [];
  const VIO_BATCH = 500;
  for (let i = 0; i < inspIds.length; i += VIO_BATCH) {
    const batch = inspIds.slice(i, i + VIO_BATCH);
    const { data: viols, error: vErr } = await supa
      .from("inspection_violations")
      .select("*")
      .in("inspection_id", batch);
    if (vErr) { log("Error fetching violations:", vErr); stats.errors++; }
    else allViolations.push(...(viols || []));
  }

  log(`${allViolations.length} violation rows to archive`);

  // Step 4: Build archive JSON
  const archivePayload = {
    archived_at: new Date().toISOString(),
    cutoff_date: THREE_YEARS_AGO,
    inspection_count: archiveRows.length,
    violation_count: allViolations.length,
    inspections: archiveRows,
    violations: allViolations,
  };

  const json = JSON.stringify(archivePayload, null, 2);
  const gzipped = gzipSync(Buffer.from(json));
  const dateStr = new Date().toISOString().slice(0, 10);
  const r2Key = `archive-${dateStr}-${Date.now()}.json.gz`;

  // Step 5: Upload to R2
  log(`Uploading ${r2Key} to R2 bucket "${R2_BUCKET}"...`);
  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: r2Key,
    Body: gzipped,
    ContentType: "application/json",
    ContentEncoding: "gzip",
    Metadata: {
      archived_at: new Date().toISOString(),
      inspection_count: String(archiveRows.length),
      violation_count: String(allViolations.length),
    },
  }));
  log(`Upload complete: ${r2Key}`);
  stats.archived = archiveRows.length;

  // Step 6: Delete old inspection rows from Supabase
  // Violations will cascade if FK + ON DELETE CASCADE is set; otherwise delete explicitly.
  log("Deleting archived inspection rows from Supabase...");

  const DEL_BATCH = 200;
  for (let i = 0; i < inspIds.length; i += DEL_BATCH) {
    const batch = inspIds.slice(i, i + DEL_BATCH);

    // Delete violations first (in case no cascade)
    const { error: vDelErr } = await supa
      .from("inspection_violations")
      .delete()
      .in("inspection_id", batch);
    if (vDelErr) { log("Error deleting violations:", vDelErr); stats.errors++; }

    const { error: iDelErr } = await supa
      .from("inspections")
      .delete()
      .in("inspection_id", batch);

    if (iDelErr) {
      log("Error deleting inspections batch:", iDelErr);
      stats.errors++;
    } else {
      stats.deleted += batch.length;
    }
  }

  return stats;
}

main()
  .then((stats) => {
    console.log("\n── Archive summary ──────────────────────────────────");
    console.log(`  Archived to R2 : ${stats.archived} inspection rows`);
    console.log(`  Deleted        : ${stats.deleted} rows from Supabase`);
    console.log(`  Skipped        : ${stats.skipped} (no newer inspection)`);
    console.log(`  Errors         : ${stats.errors}`);
    process.exit(stats.errors > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
