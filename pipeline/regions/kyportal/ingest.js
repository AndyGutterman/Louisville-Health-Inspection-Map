/**
 * regions/kyportal/ingest.js — the daily load of a county from Kentucky's inspection
 * portal (fetch.js, parse.js; the counties are listed in counties.js).
 *
 *   1. Download the county's page (two requests) and parse it. A page that doesn't look
 *      as expected stops the job before anything is written.
 *   2. Store it (store.js): places, new results, and when the portal last answered.
 *   3. Pin places without coordinates (lib/countyGeocode.js, the same steps as Bullitt).
 *
 * Only portal_* tables are written. Jefferson (ArcGIS) and Bullitt (its sheet) load in
 * their own jobs, so if the portal fails or goes away they carry on (docs/COUNTIES.md).
 *
 * Usage (from pipeline/):
 *   node regions/kyportal/ingest.js --county=oldham            # the daily job
 *   node regions/kyportal/ingest.js --county=oldham --save=oldham.html
 *                                          # ...and keep the downloaded page
 *   node regions/kyportal/ingest.js --county=oldham --from=oldham.html
 *                                          # load a page saved earlier: no portal request
 *   node regions/kyportal/ingest.js --county=oldham --retry-failures
 *   node regions/kyportal/ingest.js --county=oldham --redo-geocoding
 *   node regions/kyportal/ingest.js --county=oldham --dry-run  # print only, no database
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { countyGeocoder } from "../../lib/countyGeocode.js";
import { parseOverrides } from "../../lib/overrides.js";
import { countyById, idPrefix } from "./counties.js";
import { fetchCountyPage } from "./fetch.js";
import { parsePortalPage } from "./parse.js";
import { storeCounty } from "./store.js";
import { countyCounts, newestInspections } from "./summary.js";

const args = process.argv.slice(2);
const option = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const DRY_RUN = args.includes("--dry-run");
const RETRY_FAILURES = args.includes("--retry-failures");
const REDO_GEOCODING = args.includes("--redo-geocoding");

const REPO = new URL("../../../", import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, REPO), "utf8"));

// Today in Louisville, as YYYY-MM-DD.
const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Kentucky/Louisville" });

function printSummary(total, establishments, warnings) {
  const c = countyCounts(establishments);
  console.log(
    `${total} rows: ${c.places} places (${c.notInspected} not inspected yet), ` +
      `${c.inspections} inspections (${c.followUps} follow-ups, ${c.withViolations} with ` +
      `items marked). Newest: ${c.newest || "none"}.`,
  );
  console.log("\nNewest inspections:");
  for (const i of newestInspections(establishments, 10)) {
    const score = i.score == null ? "–" : `${i.score}${i.grade ? `/${i.grade}` : ""}`;
    const kind = i.kind === "follow_up" ? " (follow-up)" : "";
    console.log(
      `  ${i.inspection_date}  ${String(score).padStart(5)}  ${i.name}${kind}, ${i.address}, ${i.city}`,
    );
  }
  console.log(`\n${warnings.length} warnings.`);
  for (const w of warnings) console.log(`  ${w}`);
}

function geocoderFor(county) {
  return countyGeocoder({
    outline: readJson(county.outline),
    defaults: { city: county.defaultCity, state: "KY" },
    county911: county.county911,
    keyPrefix: county.id,
    overrides: parseOverrides(readJson(county.overrides)),
    table: "portal_establishments",
    scope: (q) => q.eq("region", county.id),
  });
}

(async function run() {
  const countyId = option("county");
  if (!countyId) throw new Error("Say which county: --county=oldham");
  const county = countyById(countyId);

  const from = option("from");
  const html = from ? readFileSync(from, "utf8") : await fetchCountyPage(county.number);
  console.log(
    from
      ? `${county.name}: read ${from}`
      : `${county.name}: downloaded ${Math.round(html.length / 1024)} KB`,
  );
  const save = option("save");
  if (save) {
    writeFileSync(save, html);
    console.log(`Saved the page to ${save}`);
  }

  const { total, establishments, warnings } = parsePortalPage(html, {
    idPrefix: idPrefix(county),
  });
  printSummary(total, establishments, warnings);
  if (DRY_RUN) {
    console.log("Dry run: nothing was stored.");
    return;
  }

  const { supa } = await import("../../lib/db.js"); // only now: --dry-run needs no credentials
  const stored = await storeCounty(supa, county, establishments, { day: today() });
  console.log(
    stored.unchanged
      ? `\nUnchanged since ${stored.since}.`
      : `\nStored ${stored.places} places (${stored.newPlaces} new, ${stored.gonePlaces} gone) ` +
          `and ${stored.newInspections} new inspections.`,
  );

  const geo = geocoderFor(county);
  await geo.applyOverrides(supa);
  await geo.geocodeMissing(supa, { retryFailures: RETRY_FAILURES, redo: REDO_GEOCODING });
})().catch((err) => {
  console.error("Portal load failed:", err.message);
  process.exit(1);
});
