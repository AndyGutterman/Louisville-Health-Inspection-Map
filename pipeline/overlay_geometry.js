/**
 * overlay_geometry.js
 * Refreshes name, address, and coordinates for all facilities from FoodServiceData.
 * FoodMapping blocks all requests (499 Token Required) — do not use it.
 * Runs twice in ingest.yml to catch stubs created by seed_inspections.
 *
 * Places pinned or hidden by hand in the pin control center keep their pin; the rows'
 * rules are in lib/facilityRows.js.
 */
import { supa } from "./lib/db.js";
import { paginateArcGIS } from "./lib/arcgis.js";
import { batchesByKeys, overlayRow } from "./lib/facilityRows.js";
import { handPin, readFixes } from "./lib/placeFixes.js";

const FS_BASE =
  "https://services1.arcgis.com/79kfd2K6fskCAkyg/ArcGIS/rest/services/FoodServiceData/FeatureServer/0";
const BATCH = 500;

(async function run() {
  const fixes = await readFixes(supa, ["jefferson"]);
  const byHand = new Set([...fixes.values()].filter(handPin).map((f) => f.place_id));
  if (byHand.size) console.log(`${byHand.size} places pinned or hidden by hand keep their pin.`);

  // Deduplicate by eid — FoodServiceData has duplicate EstablishmentID rows
  const byEid = new Map();

  console.log("Scanning FoodServiceData…");
  for await (const { attrs, page, offset } of paginateArcGIS(
    FS_BASE,
    {
      where: "1=1",
      outFields: "EstablishmentID,EstablishmentName,Address,City,State,Zip",
      orderByFields: "EstablishmentID ASC",
      returnGeometry: "true",
      outSR: "4326",
    },
    { pageSize: 1000, delayMs: 50 },
  )) {
    // _lon/_lat attached by fetchArcGISPage when returnGeometry=true
    for (const a of attrs) {
      const row = overlayRow(a, byHand);
      if (row) byEid.set(row.establishment_id, row);
    }
    console.log(`  page ${page} @${offset}: ${attrs.length} records (${byEid.size} unique)`);
  }

  console.log(`\nUpserting ${byEid.size} facilities…`);
  let total = 0;
  for (const batch of batchesByKeys([...byEid.values()], BATCH)) {
    const { error } = await supa
      .from("facilities")
      .upsert(batch, { onConflict: "establishment_id" });
    if (error) throw error;
    total += batch.length;
  }

  console.log(`overlay_geometry complete — ${total} facilities updated.`);
})().catch((err) => {
  console.error("overlay_geometry failed:", err);
  process.exit(1);
});
