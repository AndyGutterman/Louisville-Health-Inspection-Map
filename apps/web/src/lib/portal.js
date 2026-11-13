// Counties shown from Kentucky's inspection portal tables (Oldham; lib/regions.js
// feed: "portal"): v_portal_map_feed and portal_inspections rows (migrations
// 20261119000000 and 20261121000000) shaped like Louisville's, so the map, popups and
// drawer can show them. Pure.
//
// The same kind of data as Bullitt's (each place's latest inspection and follow-up, the
// inspection-form items marked, no facility types or placards), but every result is
// dated, so the Bullitt helpers do the shaping and nothing is estimated. See
// docs/COUNTIES.md.
import { buildBullittFeatures, historyRow, violationsNote } from "./bullitt.js";

// A place the portal lists with no result yet (10 of Oldham's 321 in November 2026).
export const NOT_INSPECTED = "Not inspected yet";

// When one place has two or more results on its newest day.
export const SEVERAL_RESULTS_NOTE =
  "The portal lists more than one result for this place on the same day, one for each " +
  "kind of inspection (a school's kitchen and its playground, a hotel and its pool), " +
  "without saying which is which. The map shows the lowest.";

/**
 * Map features from v_portal_map_feed rows: Bullitt's shape (lib/bullitt.js), with each
 * row's own region. A place with no result yet says so instead of "Date not published".
 * @param {object[]} rows
 */
export function buildPortalFeatures(rows) {
  return buildBullittFeatures(rows).map((f) => {
    const p = f.properties;
    if (p.date || p.score != null) return f;
    return { ...f, properties: { ...p, date_text: NOT_INSPECTED } };
  });
}

const later = (a, b) => (a > b ? -1 : a < b ? 1 : 0); // ISO dates, newest first
const lowScoreFirst = (a, b) => (a.score ?? Infinity) - (b.score ?? Infinity);

/**
 * portal_inspections rows as drawer history rows, in the order the map feed picks them:
 * the latest load's results first; within a load, newest day first, the follow-up (the
 * later visit) before the routine inspection, and the lowest score first.
 * @param {object[]} rows
 * @param {{ county: string }} opts  the county's name, for the note above violations
 */
export function portalHistory(rows, { county }) {
  const note = violationsNote(county);
  return (rows || [])
    .slice()
    .sort(
      (a, b) =>
        later(a.last_seen, b.last_seen) ||
        later(a.inspection_date ?? "", b.inspection_date ?? "") ||
        (a.kind === b.kind ? 0 : a.kind === "follow_up" ? -1 : 1) ||
        lowScoreFirst(a, b) ||
        (b.id ?? 0) - (a.id ?? 0),
    )
    .map((r) => ({ ...historyRow(r, { note }), last_seen: r.last_seen ?? null }));
}

// The drawer header shows what the pin does: the first scored result (a follow-up with
// no score yet doesn't count).
export const portalHeader = (history) =>
  history.find((r) => Number.isFinite(r.score)) ?? history[0] ?? null;

/**
 * Whether the header's day has more than one result of its kind on the latest load (the
 * school with a kitchen and a playground result).
 * @param {object[]} history  portalHistory(...)
 */
export function hasSeveralResults(history) {
  const head = portalHeader(history);
  if (!head) return false;
  const same = history.filter(
    (r) =>
      r.last_seen === head.last_seen &&
      r.kind === head.kind &&
      r.inspection_date === head.inspection_date,
  );
  return same.length > 1;
}

/**
 * The drawer's note on where the history comes from.
 * @param {object[]} history  portalHistory(...)
 * @param {string} agency     the health department's name
 */
export function portalSourceNote(history, agency) {
  const note =
    `From the ${agency}, through Kentucky's inspection portal, which shows each place's ` +
    "latest inspection and follow-up. Earlier ones appear here as this site records them.";
  return hasSeveralResults(history) ? `${note} ${SEVERAL_RESULTS_NOTE}` : note;
}
