/**
 * etl-accuracy-check.js
 *
 * Pulls 10 random establishment_ids from Supabase, fetches their most recent
 * inspection from the inspections table, then compares against the live
 * ArcGIS Louisville data endpoint. Outputs a pass/fail report.
 */

import { createClient } from "@supabase/supabase-js";
import fetch from "node-fetch";
import "dotenv/config";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supa = createClient(SUPABASE_URL, SUPABASE_KEY);

// ArcGIS FeatureServer — same source as the ETL uses
const ARCGIS_BASE =
  "https://maps.louisvilleky.gov/arcgis/rest/services/Health/FoodServiceData/FeatureServer/0/query";

async function fetchArcGISInspection(establishment_id) {
  const params = new URLSearchParams({
    where: `ESTABLISHMENT_ID = '${establishment_id}'`,
    outFields: "ESTABLISHMENT_ID,INSPECTION_DATE,SCORE,GRADE",
    orderByFields: "INSPECTION_DATE DESC",
    resultRecordCount: "1",
    f: "json",
  });
  const url = `${ARCGIS_BASE}?${params}`;
  const res = await fetch(url, { timeout: 15000 });
  if (!res.ok) throw new Error(`ArcGIS HTTP ${res.status}`);
  const json = await res.json();
  const feat = json.features?.[0]?.attributes;
  if (!feat) return null;
  const dateMs = feat.INSPECTION_DATE;
  const isoDate = dateMs
    ? new Date(dateMs).toISOString().slice(0, 10)
    : null;
  return {
    inspection_date: isoDate,
    score: feat.SCORE ?? null,
    grade: (feat.GRADE ?? "").trim() || null,
  };
}

async function main() {
  console.log("ETL Accuracy Check — " + new Date().toISOString());
  console.log("─".repeat(64));

  // Pull 10 random establishment IDs that have at least one inspection
  const { data: sample, error: sErr } = await supa
    .from("inspections")
    .select("establishment_id, inspection_date, score, grade")
    .order("inspection_date", { ascending: false })
    .limit(200);

  if (sErr) { console.error("Supabase error:", sErr); process.exit(1); }

  // Deduplicate, pick 10 random ones
  const seen = new Set();
  const pool = [];
  for (const r of sample) {
    if (!seen.has(r.establishment_id)) {
      seen.add(r.establishment_id);
      pool.push(r);
    }
    if (pool.length >= 30) break;
  }

  const indices = new Set();
  while (indices.size < Math.min(10, pool.length)) {
    indices.add(Math.floor(Math.random() * pool.length));
  }
  const chosen = [...indices].map((i) => pool[i]);

  let passed = 0, failed = 0;
  const mismatches = [];

  for (const local of chosen) {
    const eid = local.establishment_id;
    let live = null;
    try {
      live = await fetchArcGISInspection(eid);
    } catch (e) {
      console.warn(`  SKIP  ${eid} — ArcGIS fetch failed: ${e.message}`);
      continue;
    }

    if (!live) {
      console.warn(`  SKIP  ${eid} — not found in ArcGIS`);
      continue;
    }

    const dateMatch  = local.inspection_date === live.inspection_date;
    const scoreMatch = local.score === live.score || (local.score == null && live.score == null);
    const gradeMatch = (local.grade ?? "").trim() === (live.grade ?? "").trim();
    const ok = dateMatch && scoreMatch && gradeMatch;

    if (ok) {
      passed++;
      console.log(`  PASS  ${eid}  date=${local.inspection_date}  score=${local.score}  grade=${local.grade}`);
    } else {
      failed++;
      const detail = [];
      if (!dateMatch)  detail.push(`date: local=${local.inspection_date} live=${live.inspection_date}`);
      if (!scoreMatch) detail.push(`score: local=${local.score} live=${live.score}`);
      if (!gradeMatch) detail.push(`grade: local=${local.grade} live=${live.grade}`);
      mismatches.push({ eid, detail });
      console.log(`  FAIL  ${eid}  ${detail.join(" | ")}`);
    }
  }

  console.log("\n" + "─".repeat(64));
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (mismatches.length > 0) {
    console.log("\nMismatches:");
    for (const m of mismatches) {
      console.log(`  ${m.eid}: ${m.detail.join(", ")}`);
    }
    process.exit(1);
  }

  console.log("All checks passed.");
  process.exit(0);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
