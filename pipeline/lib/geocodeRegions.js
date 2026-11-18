/**
 * lib/geocodeRegions.js — every county the site has, as its geocoding needs it: the
 * outline a pin must fall in, the town for rows missing one, its name in Kentucky's 911
 * layer, its geocode_cache prefix, and the table its places (and pins) are in.
 *
 * The pin-fixes job (pins/run.js) reads this to geocode any county's corrected
 * addresses. Portal counties come from regions/kyportal/counties.js, so a new county
 * there is a new county here.
 */
import { COUNTIES } from "../regions/kyportal/counties.js";

export const GEOCODE_REGIONS = {
  // Pins from Louisville Metro's own data; geocode_missing.js for the rest. No 911 step:
  // the county's points would be about 100 downloads a run.
  jefferson: {
    id: "jefferson",
    outline: "apps/web/public/regions/jefferson.geojson",
    defaultCity: "Louisville",
    county911: null,
    keyPrefix: "",
    table: "facilities",
    idColumn: "establishment_id",
  },
  ...Object.fromEntries(
    Object.values(COUNTIES).map((c) => [
      c.id,
      {
        id: c.id,
        outline: c.outline,
        defaultCity: c.defaultCity,
        county911: c.county911,
        keyPrefix: c.id,
        // Bullitt's map pins are on its own table (its sheet came first).
        table: c.id === "bullitt" ? "bullitt_establishments" : "portal_establishments",
        idColumn: "id",
      },
    ]),
  ),
};

export function geocodeRegion(id) {
  const region = GEOCODE_REGIONS[id];
  if (!region) {
    throw new Error(`Unknown region "${id}". Known: ${Object.keys(GEOCODE_REGIONS).join(", ")}`);
  }
  return region;
}

/** Some of a region's places by id, as the geocoder reads them ({ id, name, address, ... }). */
export function placesQuery(supa, region, ids) {
  return supa
    .from(region.table)
    .select(`id:${region.idColumn}, name, address, city, state`)
    .in(region.idColumn, ids);
}
