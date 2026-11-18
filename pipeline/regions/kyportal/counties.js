/**
 * regions/kyportal/counties.js — the counties read from Kentucky's inspection portal.
 *
 * `number` is the county's place in the alphabetical list of Kentucky's 120 counties
 * (the portal's ?County= value: Adair 1 ... Bullitt 15 ... Oldham 93 ... Shelby 106, Spencer 108 ... Woodford 120).
 * `id` is the region id used across the site and database; ids of its places start with
 * `<id>-`. The rest is for geocoding (lib/countyGeocode.js): `county911` as Kentucky's
 * 911 layer writes it, `defaultCity` for rows missing a town, the outline the website
 * draws, and a file of pins placed by hand. To read another county, add it here
 * (docs/COUNTIES.md has the other steps).
 */
import { countyName } from "@lfs/core/regions.js";

export const COUNTIES = {
  // Also loaded from its own sheet (regions/bullitt), which stays as the fallback. Same
  // ids, geocode cache keys and hand-placed pins as the sheet's, so both agree.
  bullitt: {
    id: "bullitt",
    number: 15,
    name: countyName("bullitt"),
    county911: "Bullitt County",
    defaultCity: "Shepherdsville",
    outline: "apps/web/public/regions/bullitt.geojson",
    overrides: "pipeline/regions/bullitt/overrides.json",
  },
  oldham: {
    id: "oldham",
    number: 93,
    name: countyName("oldham"),
    county911: "Oldham County",
    defaultCity: "La Grange",
    outline: "apps/web/public/regions/oldham.geojson",
    overrides: "pipeline/regions/kyportal/overrides/oldham.json",
  },
  shelby: {
    id: "shelby",
    number: 106,
    name: countyName("shelby"),
    county911: "Shelby County",
    defaultCity: "Shelbyville",
    outline: "apps/web/public/regions/shelby.geojson",
    overrides: "pipeline/regions/kyportal/overrides/shelby.json",
  },
  spencer: {
    id: "spencer",
    number: 108,
    name: countyName("spencer"),
    county911: "Spencer County",
    defaultCity: "Taylorsville",
    outline: "apps/web/public/regions/spencer.geojson",
    overrides: "pipeline/regions/kyportal/overrides/spencer.json",
  },
};

export function countyById(id) {
  const county = COUNTIES[id];
  if (!county) {
    throw new Error(`Unknown county "${id}". Known: ${Object.keys(COUNTIES).join(", ")}`);
  }
  return county;
}

export const idPrefix = (county) => `${county.id}-`;
