/**
 * regions/bullitt/ingest.js — the daily Bullitt County load.
 *
 *   1. Download the health department's sheet as CSV (parse.js reads it). When it has
 *      changed since the last load, keep a copy in bullitt_snapshots.
 *   2. Add or update each establishment; ones no longer on the sheet become inactive.
 *   3. Record each establishment's current inspections. A changed score or violation
 *      list is a new row, so history builds up from the first load on.
 *   4. Geocode places without coordinates: Kentucky's 911 address points first (the
 *      county's own record of every addressed building), then the Census, then
 *      Nominatim (building-level matches only), then an approximate 911 point between
 *      neighbouring house numbers. Flag matches outside the county.
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
import { buildStreetIndex, matchAddress } from "../../lib/addressPoints.js";
import { bbox, containsPoint } from "../../lib/geo.js";
import {
  DELAY_MS,
  USER_AGENT,
  buildQuery,
  cacheKey,
  geocodeCensus,
  geocodeCensusLine,
  geocodeNominatim,
  firstInside,
  sleep,
  stripSuite,
} from "../../lib/geocode.js";
import { fetchCountyAddressPoints } from "../../lib/ky911.js";
import { overrideFor, parseOverrides } from "./overrides.js";
import { parseSheet } from "./parse.js";

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
const [W, S, E, N] = bbox(OUTLINE);
const SEARCH_BOX = [W - 0.02, S - 0.02, E + 0.02, N + 0.02]; // about 2 km of slack
const DEFAULTS = { city: "Shepherdsville", state: "KY" };

// Pins placed by hand for addresses no geocoder finds. They win over every geocoder.
const OVERRIDES = parseOverrides(
  JSON.parse(readFileSync(new URL("./overrides.json", import.meta.url), "utf8")),
);

// A sheet with less than half the places of the last one is more likely broken than real.
const MIN_SHARE_OF_LAST = 0.5;
const CHUNK = 500;

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const RETRY_FAILURES = args.includes("--retry-failures");
const REDO_GEOCODING = args.includes("--redo-geocoding");

// Bullitt's own geocode_cache keys. The sheet often has the mailing town (Hillview
// addresses say LOUISVILLE), so without a prefix a Louisville lookup of the same text
// could stand in for a Bullitt one.
const bullittKey = (row) => `bullitt|${cacheKey(buildQuery(row, DEFAULTS))}`;
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

// Straight-line distance between two { lon, lat } points, in km (fine at county scale).
const distanceKm = (a, b) => {
  const kmPerDeg = 111.32;
  const dx = (a.lon - b.lon) * kmPerDeg * Math.cos((a.lat * Math.PI) / 180);
  const dy = (a.lat - b.lat) * kmPerDeg;
  return Math.hypot(dx, dy);
};

async function downloadSheet() {
  const res = await fetch(SHEET_CSV, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Sheet download failed: HTTP ${res.status}`);
  const text = await res.text();
  if (/^\s*</.test(text))
    throw new Error("Sheet download returned HTML, not CSV (no longer public?)");
  return text;
}

// The county's 911 address points, downloaded the first time a place needs them (about
// 10 requests). Null if the state's server is down: that step is then skipped.
const COUNTY_911 = "Bullitt County";
let streets = null;
function addressPointStreets() {
  streets ??= fetchCountyAddressPoints(COUNTY_911)
    .then((points) => {
      const index = buildStreetIndex(points);
      console.log(`  KY 911 address points: ${points.length} on ${index.length} streets`);
      return index;
    })
    .catch((e) => {
      console.error(`  KY 911 address points unavailable: ${e.message}`);
      return null;
    });
  return streets;
}

// In order, the first match inside the county wins (lib/geocode.js firstInside):
//   1. an exact 911 address point: the county's record of that building;
//   2. the Census, which places the number along its street's address range;
//   3. Nominatim inside the county's box, only when it matched the building itself (a
//      street-level answer once put every address on Old Preston Hwy on one spot);
//   4. the Census without the town (the sheet sometimes has the mailing town);
//   5. a 911 point between neighbouring house numbers (ky911-approx).
// If nothing lands inside the county, the first match is kept and flagged.
async function geocode(row) {
  const query = buildQuery(row, DEFAULTS);
  const fixed = overrideFor(OVERRIDES, row, DEFAULTS);
  if (fixed) {
    const { lon, lat, note } = fixed;
    return { query, result: { lon, lat, provider: "manual", confidence: 1, raw: { note } } };
  }
  const inCounty = (r) => !!r && containsPoint(OUTLINE, [r.lon, r.lat]);
  const street = stripSuite(row.address || "");
  let approx911 = null;
  const result = await firstInside(
    [
      async () => {
        const index = await addressPointStreets();
        const m = index && matchAddress(index, { address: street, city: row.city });
        if (m?.provider === "ky911-approx") {
          approx911 = m; // a guess between neighbours: only if nothing better turns up
          return null;
        }
        return m;
      },
      () => geocodeCensus(row, DEFAULTS),
      () => geocodeNominatim(query, { viewbox: SEARCH_BOX }),
      () => geocodeCensusLine(`${street}, KY`, { accept: inCounty }),
      async () => approx911,
    ],
    inCounty,
    { onError: (e) => console.error(`  geocode error for "${query}": ${e.message}`) },
  );
  return { query, result };
}

// --dry-run: no database. With --preview, geocode every place into a GeoJSON file.
async function dryRun(establishments) {
  if (!PREVIEW) return;
  const features = [];
  for (const [i, e] of establishments.entries()) {
    const { query, result } = await geocode(e);
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

  // 2. Establishments. New ones get first_seen; existing ones keep theirs.
  const known = new Set();
  for (let from = 0; ; from += 1000) {
    const rows = must(
      await supa
        .from("bullitt_establishments")
        .select("id")
        .range(from, from + 999),
      "read establishments",
    );
    rows.forEach((r) => known.add(r.id));
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
      await supa.from("bullitt_establishments").upsert(part.map(place), { onConflict: "id" }),
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
  const seen = new Set();
  for (let from = 0; ; from += 1000) {
    const rows = must(
      await supa
        .from("bullitt_inspections")
        .select("establishment_id, kind, content_hash")
        .range(from, from + 999),
      "read inspections",
    );
    rows.forEach((r) => seen.add(`${r.establishment_id}|${r.kind}|${r.content_hash}`));
    if (rows.length < 1000) break;
  }
  const current = establishments.flatMap((e) =>
    [e.routine, e.follow_up]
      .filter(Boolean)
      .map((i) => ({ establishment_id: e.id, ...i, last_seen: day })),
  );
  const isNew = (i) => !seen.has(`${i.establishment_id}|${i.kind}|${i.content_hash}`);
  const fresh = current.filter(isNew);
  for (const part of chunks(fresh)) {
    must(
      await supa.from("bullitt_inspections").insert(part.map((i) => ({ ...i, first_seen: day }))),
      "add inspections",
    );
  }
  for (const part of chunks(current.filter((i) => !isNew(i)))) {
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

// Every run, before geocoding: put each hand-placed pin (overrides.json) on its places,
// including ones a geocoder already pinned.
async function applyOverrides(supa) {
  if (!OVERRIDES.size) return;
  const rows = must(
    await supa
      .from("bullitt_establishments")
      .select("id, address, city, state, lon, lat, geocode_provider"),
    "read places for hand-placed pins",
  );
  let updated = 0;
  for (const row of rows) {
    const o = overrideFor(OVERRIDES, row, DEFAULTS);
    if (!o || (row.geocode_provider === "manual" && row.lon === o.lon && row.lat === o.lat)) {
      continue;
    }
    must(
      await supa
        .from("bullitt_establishments")
        .update({
          lon: o.lon,
          lat: o.lat,
          geocode_provider: "manual",
          geocode_query: buildQuery(row, DEFAULTS),
          geocode_outside_county: !containsPoint(OUTLINE, [o.lon, o.lat]),
          geocoded_at: new Date().toISOString(),
        })
        .eq("id", row.id),
      "save hand-placed pin",
    );
    updated++;
  }
  console.log(`Hand-placed pins: ${OVERRIDES.size} in overrides.json, ${updated} places updated.`);
}

// Places with no pin yet (and, with --retry-failures, ones that failed before). With
// --redo-geocoding, every active place except hand-placed ones, ignoring the cache.
async function geocodeMissing(supa) {
  let q = supa
    .from("bullitt_establishments")
    .select("id, name, address, city, state, lon, lat")
    .eq("active", true);
  if (REDO_GEOCODING) q = q.or("geocode_provider.is.null,geocode_provider.neq.manual");
  else {
    q = q.is("lon", null);
    if (!RETRY_FAILURES) q = q.is("geocoded_at", null);
  }
  const todo = must(await q, "read places to geocode");
  console.log(`Places to geocode: ${todo.length}${REDO_GEOCODING ? " (redoing all)" : ""}`);
  if (!todo.length) return;

  const keys = todo.map(bullittKey);
  const cached = new Map();
  for (const part of chunks([...new Set(keys)], 100)) {
    must(
      await supa.from("geocode_cache").select("key, lon, lat, provider").in("key", part),
      "read geocode cache",
    ).forEach((c) => cached.set(c.key, c));
  }

  let hits = 0;
  let outside = 0;
  let misses = 0;
  let moved = 0;
  for (const row of todo) {
    const key = bullittKey(row);
    let result = REDO_GEOCODING ? null : cached.get(key);
    let query = buildQuery(row, DEFAULTS);
    if (!result || (result.lon == null && RETRY_FAILURES)) {
      ({ query, result } = await geocode(row));
      must(
        await supa.from("geocode_cache").upsert(
          {
            key,
            lon: result?.lon ?? null,
            lat: result?.lat ?? null,
            provider: result?.provider ?? null,
            confidence: result?.confidence ?? null,
            meta: result?.raw ?? null,
          },
          { onConflict: "key" },
        ),
        "save geocode cache",
      );
      await sleep(DELAY_MS);
    }
    const found = result?.lon != null;
    const out = found && !containsPoint(OUTLINE, [result.lon, result.lat]);
    must(
      await supa
        .from("bullitt_establishments")
        .update({
          lon: found ? result.lon : null,
          lat: found ? result.lat : null,
          geocode_provider: found ? result.provider : null,
          geocode_query: query,
          geocode_outside_county: found ? out : null,
          geocoded_at: new Date().toISOString(),
        })
        .eq("id", row.id),
      "save coordinates",
    );
    if (REDO_GEOCODING && row.lon != null) {
      const km = found ? distanceKm(row, result) : null;
      if (km == null || km > 0.05) {
        moved++;
        console.log(
          `  moved: ${row.name} — ${km == null ? "pin removed (no match)" : `${km.toFixed(2)} km`} (${result?.provider ?? "none"})`,
        );
      }
    }
    if (!found) {
      misses++;
      console.warn(`  ✗ no match: ${row.name} — ${query}`);
    } else if (out) {
      outside++;
      console.warn(`  ! outside the county: ${row.name} — ${query} (${result.provider})`);
    } else hits++;
  }
  console.log(
    `Geocoded ${hits} in the county, ${outside} outside it (still pinned), ${misses} not found.` +
      (REDO_GEOCODING ? ` ${moved} pins moved more than 50 m or were removed.` : ""),
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
  await applyOverrides(supa);
  await geocodeMissing(supa);
})().catch((err) => {
  console.error("Bullitt ingest failed:", err.message);
  process.exit(1);
});
