/**
 * regions/kyportal/summary.js — what a parsed county looks like, in numbers and in its
 * newest inspections, for the dry run's printout (ingest.js). Pure.
 */

/** Counts over parsePortalPage's establishments. */
export function countyCounts(establishments) {
  const inspections = establishments.flatMap((e) => e.inspections);
  return {
    places: establishments.length,
    notInspected: establishments.filter((e) => e.inspections.length === 0).length,
    inspections: inspections.length,
    followUps: inspections.filter((i) => i.kind === "follow_up").length,
    withViolations: inspections.filter((i) => i.violations.length > 0).length,
    newest: inspections.reduce((d, i) => (i.inspection_date > d ? i.inspection_date : d), ""),
  };
}

/**
 * The `limit` most recent inspections across the county, newest first, each with its
 * place: { name, address, city, kind, inspection_date, score, grade, violations }.
 */
export function newestInspections(establishments, limit = 10) {
  return establishments
    .flatMap((e) =>
      e.inspections
        .filter((i) => i.inspection_date)
        .map((i) => ({ name: e.name, address: e.address, city: e.city, ...i })),
    )
    .sort(
      (a, b) => b.inspection_date.localeCompare(a.inspection_date) || a.name.localeCompare(b.name),
    )
    .slice(0, limit);
}
