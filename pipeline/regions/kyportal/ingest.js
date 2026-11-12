/**
 * regions/kyportal/ingest.js — reads a county from Kentucky's inspection portal
 * (fetch.js, parse.js; the counties are listed in counties.js).
 *
 * For now this only looks: it downloads the county's page (two requests), parses it and
 * prints what it found. Storing it in the database is the next step (docs/COUNTIES.md).
 *
 * Usage (from pipeline/):
 *   node regions/kyportal/ingest.js --county=oldham --dry-run
 *   node regions/kyportal/ingest.js --county=oldham --dry-run --save=oldham.html
 *                                          # ...and keep the downloaded page
 *   node regions/kyportal/ingest.js --county=oldham --dry-run --from=oldham.html
 *                                          # parse a saved page: no network at all
 */
import { readFileSync, writeFileSync } from "node:fs";
import { countyById, idPrefix } from "./counties.js";
import { fetchCountyPage } from "./fetch.js";
import { parsePortalPage } from "./parse.js";
import { countyCounts, newestInspections } from "./summary.js";

const args = process.argv.slice(2);
const option = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const DRY_RUN = args.includes("--dry-run");

(async function run() {
  const countyId = option("county");
  if (!countyId) throw new Error("Say which county: --county=oldham");
  const county = countyById(countyId);
  if (!DRY_RUN) {
    throw new Error("Storing isn't built yet. Add --dry-run to download and print only.");
  }

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
  console.log("Dry run: nothing was stored.");
})().catch((err) => {
  console.error("Portal read failed:", err.message);
  process.exit(1);
});
