/**
 * regions/kyportal/counties.js — the counties read from Kentucky's inspection portal.
 *
 * `number` is the county's place in the alphabetical list of Kentucky's 120 counties
 * (the portal's ?County= value: Adair 1 ... Bullitt 15 ... Oldham 93 ... Woodford 120).
 * `id` is the region id used across the site and database; ids of its places start with
 * `<id>-`. The rest is for geocoding (lib/countyGeocode.js): `county911` as Kentucky's
 * 911 layer writes it, `defaultCity` for rows missing a town, the outline the website
 * draws, and a file of pins placed by hand. To read another county, add it here
 * (docs/COUNTIES.md has the other steps).
 */
export const COUNTIES = {
  // Also loaded from its own sheet (regions/bullitt), which stays as the fallback. Same
  // ids, geocode cache keys and hand-placed pins as the sheet's, so both agree.
  bullitt: {
    id: "bullitt",
    number: 15,
    name: "Bullitt County",
    county911: "Bullitt County",
    defaultCity: "Shepherdsville",
    outline: "apps/web/public/regions/bullitt.geojson",
    overrides: "pipeline/regions/bullitt/overrides.json",
  },
  oldham: {
    id: "oldham",
    number: 93,
    name: "Oldham County",
    county911: "Oldham County",
    defaultCity: "La Grange",
    outline: "apps/web/public/regions/oldham.geojson",
    overrides: "pipeline/regions/kyportal/overrides/oldham.json",
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
