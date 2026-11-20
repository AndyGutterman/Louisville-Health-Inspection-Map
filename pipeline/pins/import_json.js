/**
 * pins/import_json.js — moves the hand-placed pins in the counties' overrides.json files
 * into place_fixes (migration 20261130000000), where the pin control center (/?page=pins)
 * shows and edits them. Run once, after the migration; then the JSON files can go.
 *
 * An overrides.json entry names an address (and sometimes a place's name); a fix names a
 * place. So each county's places are read once (a few hundred small rows) and every
 * place an entry matches gets its own fix: a pin, or a hide for an entry left without
 * coordinates on purpose. A place that already has a fix keeps it (the admin's is
 * newer). Entries that match no place are listed: the place may have closed.
 *
 * Usage (from pipeline/):
 *   node pins/import_json.js --dry-run   # print what would be saved; writes nothing
 *   node pins/import_json.js             # save
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { parseOverrides } from "../lib/overrides.js";
import { COUNTIES } from "../regions/kyportal/counties.js";
import { planImport } from "./importPlan.js";

const DRY_RUN = process.argv.includes("--dry-run");
const REPO = new URL("../../", import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, REPO), "utf8"));

const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};

// Bullitt's places are in its own table (the pins the map shows); every other county's
// are in the portal's.
const placesQuery = (supa, county) =>
  county.id === "bullitt"
    ? supa.from("bullitt_establishments").select("id, name, address, city, state")
    : supa
        .from("portal_establishments")
        .select("id, name, address, city, state")
        .eq("region", county.id);

(async function run() {
  const { supa } = await import("../lib/db.js");
  let saved = 0;
  for (const county of Object.values(COUNTIES)) {
    const entries = parseOverrides(readJson(county.overrides), { withHidden: true });
    if (!entries.size) continue;
    const places = must(await placesQuery(supa, county).limit(5000), `read ${county.id} places`);
    const existing = new Set(
      must(
        await supa.from("place_fixes").select("place_id").eq("region", county.id),
        "read existing fixes",
      ).map((f) => f.place_id),
    );
    const { fixes, unmatched } = planImport({
      region: county.id,
      entries,
      places,
      defaults: { city: county.defaultCity, state: "KY" },
      existing,
    });

    console.log(`\n${county.name}: ${entries.size} entries, ${fixes.length} places to save.`);
    for (const f of fixes) {
      console.log(
        `  ${f.action.padEnd(4)} ${f.source_name} — ${f.source_address}, ${f.source_city}`,
      );
    }
    for (const key of unmatched) console.log(`  (matches no place now) ${key}`);
    if (DRY_RUN || !fixes.length) continue;
    must(
      await supa
        .from("place_fixes")
        .upsert(fixes, { onConflict: "place_id", ignoreDuplicates: true }),
      "save fixes",
    );
    saved += fixes.length;
  }
  console.log(DRY_RUN ? "\nDry run: nothing was saved." : `\nSaved ${saved} fixes.`);
})().catch((err) => {
  console.error("Import failed:", err.message);
  process.exit(1);
});
