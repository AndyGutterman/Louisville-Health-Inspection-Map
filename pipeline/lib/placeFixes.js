/**
 * lib/placeFixes.js — fixes made by hand in the pin control center (/?page=pins,
 * docs/PINS.md), as every county's geocoding uses them. Table: place_fixes (migration
 * 20261130000000), one row per place id:
 *
 *   address  a corrected address and/or town, used only to build the geocoder's query
 *            (the source's own address stays in the place's table and on the site)
 *   pin      a pin placed by hand: wins over every geocoder
 *   hide     left off the map on purpose: never geocoded
 *   skip     looked at, nothing to do yet: geocoding carries on as usual
 *
 * The admin page writes pins and hides to the place's table itself; the daily jobs put
 * them back if anything moved them (lib/countyGeocode.js applyHandPins). Everything but
 * readFixes is pure.
 */

const PAGE = 1000;
const MAX_PAGES = 20; // 20,000 fixes: far more than there are places without a pin

// The table isn't there until migration 20261130000000 has been run.
// Any other error (permission denied, a network failure) still stops the job.
export const missingTable = (error) =>
  error?.code === "42P01" ||
  error?.code === "PGRST205" ||
  /place_fixes.*(does not exist|schema cache)|(does not exist|schema cache).*place_fixes/.test(
    error?.message ?? "",
  );

/**
 * Every fix for these regions, as Map(place id -> fix). Before the migration has been
 * run there is no table: that is no fixes, not a failure, so the daily jobs keep going.
 * @param {object} supa      a Supabase client with the service role
 * @param {string[]} regions e.g. ["oldham"]
 */
export async function readFixes(supa, regions, { log = console } = {}) {
  const fixes = new Map();
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await supa
      .from("place_fixes")
      .select("place_id, region, action, address, city, lon, lat, note, status")
      .in("region", regions)
      .order("place_id")
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) {
      if (missingTable(error)) {
        log.warn("No place_fixes table yet (migration 20261130000000): no hand fixes applied.");
        return new Map();
      }
      throw new Error(`read place fixes: ${error.message}`);
    }
    for (const f of data) fixes.set(f.place_id, f);
    if (data.length < PAGE) return fixes;
  }
  throw new Error(`read place fixes: more than ${MAX_PAGES * PAGE}; stopping`);
}

/** The row the geocoder should look up: the corrected address and town, if any. */
export function fixedRow(row, fix) {
  if (fix?.action !== "address") return row;
  return { ...row, address: fix.address ?? row.address, city: fix.city ?? row.city };
}

/**
 * The pin a fix decides, or null when the geocoders decide.
 * @returns {{ lon: number, lat: number, note: string } | { hidden: true, note: string } | null}
 */
export function handPin(fix) {
  if (fix?.action === "pin" && fix.lon != null && fix.lat != null) {
    return { lon: fix.lon, lat: fix.lat, note: fix.note ?? "" };
  }
  if (fix?.action === "hide") return { hidden: true, note: fix.note ?? "" };
  return null;
}

/** Providers the geocoders never overwrite, not even with --redo-geocoding. */
export const BY_HAND = ["manual", "hidden"];
