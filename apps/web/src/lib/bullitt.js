// Bullitt County's rows (supabase/migrations/20261110000000_bullitt_county.sql) shaped like
// Louisville's, so the map, popups and drawer can show them. Pure.
//
// The health department publishes only each place's latest inspection, without a date
// (follow-ups have one), and no facility types or placards. See docs/BULLITT.md.
import { joinAddress } from "./mapFeatures.js";
import { formatDateSafe } from "./dates.js";

export const BULLITT = "bullitt";
const ID_PREFIX = "bullitt-"; // pipeline/regions/bullitt/parse.js makes the ids

export const isBullittId = (eid) => String(eid ?? "").startsWith(ID_PREFIX);

export const NO_DATE = "Date not published";

// Shown wherever an estimated date is (drawer and popup).
export const ESTIMATE_NOTE =
  '"By" dates are estimates: the first day this site saw the result. The inspection was ' +
  "that day or earlier.";

// Under each list of violations: the sheet has the inspection form's item names only.
export const VIOLATIONS_NOTE =
  "Items on the inspection form that were marked at this visit. Bullitt County doesn't " +
  "publish the inspector's notes.";

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
 * Map features from v_bullitt_map_feed rows: the same properties as Louisville's
 * (lib/mapFeatures.js), with no date, grade or category, plus `region`. A routine result
 * that appeared after the first load gets an estimated date (date_text, date_estimated);
 * `date` stays null, so it is never mistaken for a published one.
 * @param {object[]} rows
 */
export function buildBullittFeatures(rows) {
  return (rows || [])
    .map((r) => ({ ...r, lon: toNumber(r.lon), lat: toNumber(r.lat) }))
    .filter((r) => Number.isFinite(r.lon) && Number.isFinite(r.lat))
    .map((r) => {
      const estimate = estimatedDate(r.routine_first_seen, r.tracking_since);
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [r.lon, r.lat] },
        properties: {
          establishment_id: r.establishment_id,
          name: r.premise_name,
          address: r.address,
          address_full: joinAddress({ address: r.address, city: r.city, state: "KY" }),
          zip: null,
          date: null,
          date_text: estimate ? estimateLabel(estimate) : NO_DATE,
          date_estimated: !!estimate,
          tracking_since: r.tracking_since ?? null,
          score: toNumber(r.score_recent),
          grade: null,
          facility_type: null,
          subtype: null,
          cat: "unknown",
          has_any_violation: (r.violation_count_recent ?? 0) > 0,
          follow_up_date: r.follow_up_date ?? null,
          follow_up_score: toNumber(r.follow_up_score),
          region: BULLITT,
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
    .map((r) => {
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
        violations_note: violations.length ? VIOLATIONS_NOTE : null,
      };
    });
}

// The drawer header shows the current routine inspection, like the map pin.
export const bullittHeader = (history) =>
  history.find((r) => r.kind === "routine") ?? history[0] ?? null;
