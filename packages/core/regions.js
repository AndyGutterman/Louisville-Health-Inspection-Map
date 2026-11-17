/**
 * regions.js — the counties the site covers: the id used across the site and database,
 * and the county's name. The website adds what it needs to draw each one
 * (apps/web/src/lib/regions.js) and the pipeline what it needs to load each one
 * (pipeline/regions/kyportal/counties.js); both, and the emails, take the names from here.
 */
export const COUNTIES = {
  jefferson: { id: "jefferson", name: "Jefferson County", shortName: "Jefferson" },
  bullitt: { id: "bullitt", name: "Bullitt County", shortName: "Bullitt" },
  oldham: { id: "oldham", name: "Oldham County", shortName: "Oldham" },
};

// Louisville's ids are the city's own numbers; every other county's start with its id.
export const DEFAULT_COUNTY = "jefferson";

/** "Bullitt County". An id that isn't listed is given back as it is. */
export const countyName = (id) => COUNTIES[id]?.name ?? id;

/** The county an establishment id belongs to: "bullitt-..." is Bullitt's, a bare number Jefferson's. */
export const countyOfId = (eid) =>
  Object.keys(COUNTIES).find(
    (id) => id !== DEFAULT_COUNTY && String(eid ?? "").startsWith(`${id}-`),
  ) ?? DEFAULT_COUNTY;
