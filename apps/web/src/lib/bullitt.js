// Bullitt County's rows (supabase/migrations/20261110000000_bullitt_county.sql) shaped like
// Louisville's, so the map, popups and drawer can show them. Pure.
//
// The health department publishes only each place's latest inspection, without a date
// (follow-ups have one), and no facility types or placards. See docs/BULLITT.md.
import { joinAddress } from "./mapFeatures.js";

export const BULLITT = "bullitt";
const ID_PREFIX = "bullitt-"; // pipeline/regions/bullitt/parse.js makes the ids

export const isBullittId = (eid) => String(eid ?? "").startsWith(ID_PREFIX);

export const NO_DATE = "Date not published";

const toNumber = (v) => (v == null || v === "" ? null : Number(v));

/**
 * Whether a place's latest record has violations: the ring on its pin. As in Louisville,
 * the latest record decides, so a follow-up still on the sheet counts over the routine
 * inspection before it. The feed carries the follow-up's score, not its list: a 100
 * means nothing was deducted, anything lower means something was cited. With no
 * follow-up (or one without a score), the routine inspection's violations decide.
 * @param {object} r  a v_bullitt_map_feed row
 */
export function latestHasViolations(r) {
  const followUp = toNumber(r.follow_up_score);
  if (r.follow_up_date && Number.isFinite(followUp)) return followUp < 100;
  return (toNumber(r.violation_count_recent) ?? 0) > 0;
}

/**
 * Map features from v_bullitt_map_feed rows: the same properties as Louisville's
 * (lib/mapFeatures.js), with no date, grade or category, plus `region`.
 * @param {object[]} rows
 */
export function buildBullittFeatures(rows) {
  return (rows || [])
    .map((r) => ({ ...r, lon: toNumber(r.lon), lat: toNumber(r.lat) }))
    .filter((r) => Number.isFinite(r.lon) && Number.isFinite(r.lat))
    .map((r) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [r.lon, r.lat] },
      properties: {
        establishment_id: r.establishment_id,
        name: r.premise_name,
        address: r.address,
        address_full: joinAddress({ address: r.address, city: r.city, state: "KY" }),
        zip: null,
        date: null,
        date_text: NO_DATE,
        score: toNumber(r.score_recent),
        grade: null,
        facility_type: null,
        subtype: null,
        cat: "unknown",
        has_any_violation: latestHasViolations(r),
        follow_up_date: r.follow_up_date ?? null,
        follow_up_score: toNumber(r.follow_up_score),
        region: BULLITT,
      },
    }));
}

const later = (a, b) => (a > b ? -1 : a < b ? 1 : 0); // ISO dates, newest first

/**
 * bullitt_inspections rows as drawer history rows (the shape lib/inspectionHistory.js
 * gives Louisville's), current ones first. Within one load a follow-up comes after the
 * routine inspection it checks, so it is listed above it.
 * @param {object[]} rows
 */
export function bullittHistory(rows) {
  return (rows || [])
    .slice()
    .sort(
      (a, b) =>
        later(a.last_seen, b.last_seen) ||
        later(a.first_seen, b.first_seen) ||
        (a.kind === b.kind ? 0 : a.kind === "follow_up" ? -1 : 1) ||
        (b.id ?? 0) - (a.id ?? 0),
    )
    .map((r) => ({
      inspection_id: r.id,
      kind: r.kind,
      inspection_date: r.inspection_date ?? null,
      date_label: r.inspection_date ? null : NO_DATE,
      score: toNumber(r.score),
      grade: null,
      ins_type_desc: r.kind === "follow_up" ? "Follow-up" : "Routine",
      violations: (r.violations || []).map((desc, i) => ({
        violation_oid: `${r.id}-${i}`,
        inspection_id: r.id,
        violation_desc: desc,
        insp_viol_comments: "",
      })),
    }));
}

// The drawer header shows the current routine inspection, like the map pin.
export const bullittHeader = (history) =>
  history.find((r) => r.kind === "routine") ?? history[0] ?? null;
