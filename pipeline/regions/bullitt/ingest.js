/**
 * regions/bullitt/ingest.js — the daily Bullitt County load.
 *
 *   1. Download the health department's sheet as CSV (parse.js reads it). When it has
 *      changed since the last load, keep a copy in bullitt_snapshots.
 *   2. Add or update each establishment; ones no longer on the sheet become inactive.
 *   3. Record each establishment's current inspections. A changed score or violation
 *      list is a new row, so history builds up from the first load on.
 *   4. Geocode places without coordinates (lib/countyGeocode.js): Kentucky's 911
 *      address points first (the county's own record of every addressed building), then
 *      the Census, then Nominatim (building-level matches only), then an approximate 911
 *      point between neighbouring house numbers. Flag matches outside the county.
 *
 * Usage (from pipeline/):
 *   node regions/bullitt/ingest.js                    # the daily job
 *   node regions/bullitt/ingest.js --retry-failures   # also retry addresses that failed
 *   node regions/bullitt/ingest.js --redo-geocoding   # geocode every place again (not
 *                                                     # hand-placed ones), ignoring the cache
 *   node regions/bullitt/ingest.js --dry-run          # download and parse only, no database
 *   node regions/bullitt/ingest.js --dry-run --preview=bullitt.geojson
 *                                                     # ...and geocode everything into a file
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import fetch from "node-fetch";
import { containsPoint } from "../../lib/geo.js";
import { DELAY_MS, USER_AGENT, sleep } from "../../lib/geocode.js";
import { countyGeocoder } from "../../lib/countyGeocode.js";
import { parseOverrides } from "../../lib/overrides.js";
import { parseSheet } from "./parse.js";
import { planVersions, versionKey } from "./versions.js";

// The sheet behind the drop-down on https://www.bullitthealth.org/food. The plain CSV
// export returns cells as shown (Google's gviz endpoint guesses types and can blank them).
const SHEET_ID = "1f5jInKfN7_oGSXy_o0wdYEU1tVwUd5TPP_Uk5H-pTYY";
const SHEET_CSV = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;

// The county outline the website draws. Geocodes outside it are flagged.
const OUTLINE = JSON.parse(
  readFileSync(
    new URL("../../../apps/web/public/regions/bullitt.geojson", import.meta.url),
    "utf8",
  ),
);
const DEFAULTS = { city: "Shepherdsville", state: "KY" };

// Pins placed by hand for addresses no geocoder finds. They win over every geocoder.
const OVERRIDES = parseOverrides(
  JSON.parse(readFileSync(new URL("./overrides.json", import.meta.url), "utf8")),
);

// Geocoding steps and cache: lib/countyGeocode.js. Cache keys start "bullitt|".
const GEO = countyGeocoder({
  outline: OUTLINE,
  defaults: DEFAULTS,
  county911: "Bullitt County",
  keyPrefix: "bullitt",
  overrides: OVERRIDES,
  table: "bullitt_establishments",
});

// A sheet with less than half the places of the last one is more likely broken than real.
const MIN_SHARE_OF_LAST = 0.5;
const CHUNK = 500;

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const RETRY_FAILURES = args.includes("--retry-failures");
const REDO_GEOCODING = args.includes("--redo-geocoding");

const PREVIEW = args.find((a) => a.startsWith("--preview="))?.slice("--preview=".length);

// Today in Louisville, as YYYY-MM-DD.
const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Kentucky/Louisville" });

const chunks = (list, n = CHUNK) =>
  Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};

async function downloadSheet() {
  const res = await fetch(SHEET_CSV, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Sheet download failed: HTTP ${res.status}`);
  const text = await res.text();
  if (/^\s*</.test(text))
    throw new Error("Sheet download returned HTML, not CSV (no longer public?)");
  return text;
}

// --dry-run: no database. With --preview, geocode every place into a GeoJSON file.
async function dryRun(establishments) {
  if (!PREVIEW) return;
  const features = [];
  for (const [i, e] of establishments.entries()) {
    const { query, result } = await GEO.geocode(e);
    const outside = result ? !containsPoint(OUTLINE, [result.lon, result.lat]) : null;
    console.log(
      `  ${i + 1}/${establishments.length} ${result ? (outside ? "OUTSIDE" : "ok     ") : "MISS   "} ${result?.provider ?? ""}  ${query}`,
    );
    if (result) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [result.lon, result.lat] },
        properties: {
          id: e.id,
          name: e.name,
          query,
          provider: result.provider,
          outside,
          score: e.routine?.score ?? null,
        },
      });
    }
    await sleep(DELAY_MS);
  }
  writeFileSync(PREVIEW, JSON.stringify({ type: "FeatureCollection", features }, null, 1));
  console.log(`Wrote ${features.length} points to ${PREVIEW}`);
}

async function load(supa, csv, establishments) {
  const day = today();
  const sha256 = createHash("sha256").update(csv).digest("hex");

  // 1. Snapshot, unless nothing changed.
  const [last] = must(
    await supa
      .from("bullitt_snapshots")
      .select("sha256, row_count, fetched_at")
      .order("fetched_at", { ascending: false })
      .limit(1),
    "read last snapshot",
  );
  if (last?.sha256 === sha256) {
    console.log(`Sheet unchanged since ${last.fetched_at}.`);
    return;
  }
  if (last && establishments.length < last.row_count * MIN_SHARE_OF_LAST) {
    throw new Error(
      `Sheet has ${establishments.length} places, last load had ${last.row_count}. Stopping instead of marking them all inactive.`,
    );
  }
  must(
    await supa.from("bullitt_snapshots").insert({ sha256, row_count: establishments.length, csv }),
    "save snapshot",
  );

  // 2. Establishments. New ones get first_seen; existing ones keep theirs (read here and
  // written back, since the upsert below must not send a NULL first_seen).
  const known = new Map();
  for (let from = 0; ; from += 1000) {
    const rows = must(
      await supa
        .from("bullitt_establishments")
        .select("id, first_seen")
        .range(from, from + 999),
      "read establishments",
    );
    rows.forEach((r) => known.set(r.id, r.first_seen));
    if (rows.length < 1000) break;
  }
  const place = ({ id, name, address, city, raw_city }) => ({
    id,
    name,
    address,
    city,
    raw_city,
    last_seen: day,
    active: true,
  });
  const added = establishments.filter((e) => !known.has(e.id));
  const kept = establishments.filter((e) => known.has(e.id));
  for (const part of chunks(added)) {
    must(
      await supa
        .from("bullitt_establishments")
        .insert(part.map((e) => ({ ...place(e), first_seen: day }))),
      "add establishments",
    );
  }
  for (const part of chunks(kept)) {
    must(
      await supa.from("bullitt_establishments").upsert(
        part.map((e) => ({ ...place(e), first_seen: known.get(e.id) })),
        { onConflict: "id" },
      ),
      "update establishments",
    );
  }
  const gone = must(
    await supa
      .from("bullitt_establishments")
      .update({ active: false })
      .eq("active", true)
      .lt("last_seen", day)
      .select("id"),
    "mark missing establishments inactive",
  );

  // 3. Inspections. The same content is the same inspection; anything else is new.
  const seen = new Map(); // versionKey -> first_seen
  for (let from = 0; ; from += 1000) {
    const rows = must(
      await supa
        .from("bullitt_inspections")
        .select("establishment_id, kind, content_hash, first_seen")
        .range(from, from + 999),
      "read inspections",
    );
    rows.forEach((r) => seen.set(versionKey(r), r.first_seen));
    if (rows.length < 1000) break;
  }
  const { fresh, kept: stored } = planVersions(establishments, seen, day);
  for (const part of chunks(fresh)) {
    must(await supa.from("bullitt_inspections").insert(part), "add inspections");
  }
  for (const part of chunks(stored)) {
    must(
      await supa
        .from("bullitt_inspections")
        .upsert(part, { onConflict: "establishment_id,kind,content_hash" }),
      "update inspections",
    );
  }

  console.log(
    `Loaded ${establishments.length} places (${added.length} new, ${gone.length} gone) and ` +
      `${fresh.length} new inspections.`,
  );
}

(async function run() {
  const csv = await downloadSheet();
  const { establishments, warnings } = parseSheet(csv);
  warnings.forEach((w) => console.warn(`  warning: ${w}`));
  console.log(`Sheet: ${establishments.length} places, ${warnings.length} warnings.`);

  if (DRY_RUN) return dryRun(establishments);

  const { supa } = await import("../../lib/db.js"); // only now: --dry-run needs no credentials
  await load(supa, csv, establishments);
  await GEO.applyOverrides(supa);
  await GEO.geocodeMissing(supa, { retryFailures: RETRY_FAILURES, redo: REDO_GEOCODING });
})().catch((err) => {
  console.error("Bullitt ingest failed:", err.message);
  process.exit(1);
});
