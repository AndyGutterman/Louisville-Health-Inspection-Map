// Bullitt County's rows (supabase/migrations/20261110000000_bullitt_county.sql) shaped like
// Louisville's, so the map, popups and drawer can show them. Pure.
//
// Only each place's latest inspection and follow-up are published, with no facility types
// or placards. Kentucky's inspection portal dates them; the county's own sheet, the
// fallback when the portal isn't answering, leaves the routine inspection undated. The
// database picks the source (bullitt_results, migration 20261120000000). See
// docs/BULLITT.md and docs/COUNTIES.md.
import { joinAddress } from "./mapFeatures.js";
import { formatDateSafe } from "./dates.js";

export const BULLITT = "bullitt";
const ID_PREFIX = "bullitt-"; // pipeline/regions/bullitt/parse.js makes the ids

export const isBullittId = (eid) => String(eid ?? "").startsWith(ID_PREFIX);

export const NO_DATE = "Date not published";

// Shown in the drawer whenever one of its dates is an estimate.
export const ESTIMATE_NOTE =
  '"By" dates are estimates: the first day this site saw the result. The inspection was ' +
  "that day or earlier.";

// Above each list of violations: the sheet and Kentucky's portal have the inspection
// form's item names only.
export const violationsNote = (county) =>
  `Items on the inspection form that were marked at this visit. ${county} doesn't ` +
  "publish the inspector's notes.";
export const VIOLATIONS_NOTE = violationsNote("Bullitt County");

const toNumber = (v) => (v == null || v === "" ? null : Number(v));

/**
 * The day an undated routine inspection can be pinned to, or null. The sheet is loaded
 * daily (pipeline/regions/bullitt/versions.js), so a result first seen after the first
 * load was posted that day and the inspection happened on or before it. A result already
 * on the sheet at the first load could be any age.
 * @param {string|null} firstSeen      YYYY-MM-DD the result first appeared
 * @param {string|null} trackingSince  YYYY-MM-DD of the first load
 */
export function estimatedDate(firstSeen, trackingSince) {
  if (!firstSeen || !trackingSince) return null;
  return firstSeen > trackingSince ? firstSeen : null;
}

// "By 11/12/2026": on or before that day.
export const estimateLabel = (iso) => `By ${formatDateSafe(iso)}`;

/**
 * Whether a place's latest record lists violations: the ring on its pin, by the same rule
 * as Louisville's. A follow-up still on the sheet is the latest record, so its violations
 * decide; otherwise the routine inspection's do.
 * Before migration 20261112000000 the feed has no follow_up_violation_count, only the
 * follow-up's score, so a score below 100 stands in until then.
 * @param {object} r  a v_bullitt_map_feed row
 */
export function latestHasViolations(r) {
  const count = latestViolationCount(r);
  if (count != null) return count > 0;
  const score = toNumber(r.follow_up_score);
  return Number.isFinite(score) ? score < 100 : false;
}

/**
 * How many violations the latest record lists (the follow-up's if one is on the sheet,
 * else the routine inspection's). The map fades Bullitt's ring by this count. null when a
 * follow-up is on the sheet but the feed predates follow_up_violation_count, so only its
 * score is known.
 * @param {object} r  a v_bullitt_map_feed row
 */
export function latestViolationCount(r) {
  if (r.follow_up_date) {
    const listed = toNumber(r.follow_up_violation_count);
    if (Number.isFinite(listed)) return listed;
    if (Number.isFinite(toNumber(r.follow_up_score))) return null; // the score stands in
  }
  return toNumber(r.violation_count_recent) ?? 0;
}

/**
 * Map features from v_bullitt_map_feed rows: the same properties as Louisville's
 * (lib/mapFeatures.js), with no grade or category, plus `region`. The score and date are
 * the latest record's: the follow-up when one is listed.
 *
 * `date` is set only from a published date: the follow-up's, or the routine inspection's
 * when it came from Kentucky's portal (routine_date, migration 20261120000000). When the
 * results come from the county's sheet instead, the routine has no date; one that
 * appeared after the first load gets an estimate (date_text, date_estimated; migration
 * 20261113000000) but `date` stays null, so an estimate is never mistaken for a
 * published date.
 * @param {object[]} rows
 */
export function buildBullittFeatures(rows) {
  return (rows || [])
    .map((r) => ({ ...r, lon: toNumber(r.lon), lat: toNumber(r.lat) }))
    .filter((r) => Number.isFinite(r.lon) && Number.isFinite(r.lat))
    .map((r) => {
      const routineDate = r.routine_date ?? null;
      const estimate = routineDate ? null : estimatedDate(r.routine_first_seen, r.tracking_since);
      // A follow-up still listed is the latest record, so its score and date lead.
      const followUpScore = r.follow_up_date ? toNumber(r.follow_up_score) : null;
      const latestIsFollowUp = Number.isFinite(followUpScore);
      const date = latestIsFollowUp ? r.follow_up_date : routineDate;
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [r.lon, r.lat] },
        properties: {
          establishment_id: r.establishment_id,
          name: r.premise_name,
          address: r.address,
          address_full: joinAddress({ address: r.address, city: r.city, state: "KY" }),
          zip: null,
          date,
          date_text: date ? formatDateSafe(date) : estimate ? estimateLabel(estimate) : NO_DATE,
          date_estimated: !date && !!estimate,
          tracking_since: r.tracking_since ?? null,
          score: latestIsFollowUp ? followUpScore : toNumber(r.score_recent),
          grade: null,
          facility_type: null,
          subtype: null,
          cat: "unknown",
          has_any_violation: latestHasViolations(r),
          violation_count: latestViolationCount(r),
          follow_up_date: r.follow_up_date ?? null,
          follow_up_score: toNumber(r.follow_up_score),
          region: r.region ?? BULLITT, // v_portal_map_feed rows carry theirs (lib/portal.js)
        },
      };
    });
}

const later = (a, b) => (a > b ? -1 : a < b ? 1 : 0); // ISO dates, newest first

/**
 * bullitt_inspections rows as drawer history rows (the shape lib/inspectionHistory.js
 * gives Louisville's), current ones first. Within one load a follow-up comes after the
 * routine inspection it checks, so it is listed above it.
 *
 * Form items are shown in capitals, like Louisville's violation names: the sheet capitalises
 * some (its risk factors), and showing that difference would imply a severity the site
 * doesn't judge (see CLAUDE.md, "No critical labels").
 * @param {object[]} rows
 * @param {{ trackingSince?: string|null }} [opts]  the first load's date, for estimates
 */
export function bullittHistory(rows, { trackingSince = null } = {}) {
  return (rows || [])
    .slice()
    .sort(
      (a, b) =>
        later(a.last_seen, b.last_seen) ||
        later(a.first_seen, b.first_seen) ||
        (a.kind === b.kind ? 0 : a.kind === "follow_up" ? -1 : 1) ||
        (b.id ?? 0) - (a.id ?? 0),
    )
    .map((r) => historyRow(r, { trackingSince, note: VIOLATIONS_NOTE }));
}

/**
 * One stored result (bullitt_results or portal_inspections) as a drawer history row.
 * @param {object} r
 * @param {{ trackingSince?: string|null, note: string }} opts  note: above its violations
 */
export function historyRow(r, { trackingSince = null, note }) {
  const estimate = r.inspection_date ? null : estimatedDate(r.first_seen, trackingSince);
  const violations = (r.violations || []).map((desc, i) => ({
    violation_oid: `${r.id}-${i}`,
    inspection_id: r.id,
    violation_desc: String(desc).toUpperCase(),
    insp_viol_comments: "",
  }));
  return {
    inspection_id: r.id,
    kind: r.kind,
    inspection_date: r.inspection_date ?? null,
    date_label: r.inspection_date ? null : estimate ? estimateLabel(estimate) : NO_DATE,
    date_estimated: !!estimate,
    score: toNumber(r.score),
    grade: null,
    ins_type_desc: r.kind === "follow_up" ? "Follow-up" : "Routine",
    violations,
    violations_note: violations.length ? note : null,
  };
}

// The drawer header shows the latest record, like the map pin: bullittHistory lists a
// current follow-up first.
export const bullittHeader = (history) => history[0] ?? null;

/**
 * The drawer's note on where the history comes from. Routine inspections are dated when
 * the results came from Kentucky's portal, and undated when they came from the county's
 * sheet; follow-ups are dated either way.
 * @param {object[]} history  bullittHistory(...)
 * @param {string} agency     the health department's name
 */
export function bullittSourceNote(history, agency) {
  const routines = (history || []).filter((r) => r.kind === "routine");
  const dated = routines.length > 0 && routines.every((r) => r.inspection_date);
  return dated
    ? `From the ${agency}, through Kentucky's inspection portal, which shows each place's ` +
        "latest inspection and follow-up. Earlier ones appear here as this site records them."
    : `From the ${agency}, which publishes each place's latest inspection without its ` +
        "date. Earlier ones appear here as this site records them.";
}
