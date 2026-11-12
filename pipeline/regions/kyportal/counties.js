/**
 * regions/kyportal/counties.js — the counties read from Kentucky's inspection portal.
 *
 * `number` is the county's place in the alphabetical list of Kentucky's 120 counties
 * (the portal's ?County= value: Adair 1 ... Bullitt 15 ... Oldham 93 ... Woodford 120).
 * `id` is the region id used across the site and database; ids of its places start with
 * `<id>-`. To read another county, add it here (docs/COUNTIES.md has the other steps).
 */
export const COUNTIES = {
  oldham: { id: "oldham", number: 93, name: "Oldham County" },
};

export function countyById(id) {
  const county = COUNTIES[id];
  if (!county) {
    throw new Error(`Unknown county "${id}". Known: ${Object.keys(COUNTIES).join(", ")}`);
  }
  return county;
}

export const idPrefix = (county) => `${county.id}-`;
