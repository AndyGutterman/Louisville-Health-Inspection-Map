// MapLibre filter expressions for the pin and violation-ring layers, built from the
// filter panel's state. Pure: no React, no map. features/map/mapLayers.js applies them.
import { HIT_LAYER, RING_LAYER } from "./pinPicking.js";
import { bandExprs } from "./scoring.js";
import { CATEGORY_SPECS } from "./categories.js";
import { DRAW_ORDER } from "./constants.js";

// Matches no feature: the filter for a score band that is switched off.
export const HIDDEN = ["==", ["get", "score"], "__none__"];

// Case-insensitive substring match on name, addresses, zip, and the names of other
// places sharing the pin (colocated_search, see lib/dedupe.js). null when empty.
export function searchExpression(searchTerm) {
  const term = (searchTerm || "").trim().toLowerCase();
  if (!term) return null;
  const haystack = [
    "downcase",
    [
      "concat",
      ["coalesce", ["get", "name"], ""],
      " ",
      ["coalesce", ["get", "address_full"], ""],
      " ",
      ["coalesce", ["get", "address"], ""],
      " ",
      ["coalesce", ["get", "zip"], ""],
      " ",
      ["coalesce", ["get", "colocated_search"], ""],
    ],
  ];
  return [">=", ["index-of", term, haystack], 0];
}

// Hides pins inspected before the cutoff (YYYY-MM-DD). Pins with no date are hidden
// whenever a cutoff is set. null for "All time".
export function dateExpression(cutoffDate) {
  return cutoffDate ? [">=", ["coalesce", ["get", "date"], "0000-00-00"], cutoffDate] : null;
}

// Pins whose facility type/subtype pair is switched on in the category filter, plus
// uncategorised pins when "Other / Unknown" is on.
export function categoryExpression(catToggles) {
  const selectedPairs = [];
  for (const [key, spec] of Object.entries(CATEGORY_SPECS)) {
    if (key === "unknown") continue;
    const state = catToggles[key];
    if (!state || !state.enabled) continue;
    for (const p of spec.subs) {
      const code = `${p.ft}:${p.st}`;
      if (state.subs?.[code]) selectedPairs.push(code);
    }
  }
  const unknownOn = !!catToggles.unknown?.enabled;
  const pairToken = [
    "concat",
    ["to-string", ["get", "facility_type"]],
    ":",
    ["to-string", ["get", "subtype"]],
  ];
  const pairExpr = ["in", pairToken, ["literal", selectedPairs]];
  const unknownExpr = ["==", ["get", "cat"], "unknown"];

  if (selectedPairs.length && unknownOn) return ["any", pairExpr, unknownExpr];
  if (selectedPairs.length) return pairExpr;
  if (unknownOn) return unknownExpr;
  return ["boolean", false];
}

/**
 * Filter expression for every pin and ring layer, keyed by layer id.
 * @param {object} filters
 * @param {[number, number]} filters.pins  red and yellow cut-offs (lib/scoring.js)
 * @param {{red: boolean, yellow: boolean, green: boolean, missing: boolean}} filters.show
 *   which score bands are switched on ("missing" covers zero and no score)
 * @param {object} filters.catToggles  category filter state (lib/categories.js)
 * @param {string} filters.searchTerm
 * @param {string|null} filters.cutoffDate  YYYY-MM-DD, or null for all time
 */
export function buildLayerFilters({ pins, show, catToggles, searchTerm, cutoffDate }) {
  const bands = bandExprs(pins);
  const shared = [categoryExpression(catToggles)];
  const search = searchExpression(searchTerm);
  if (search) shared.push(search);
  const date = dateExpression(cutoffDate);
  if (date) shared.push(date);

  const bandOn = {
    red: show.red,
    yellow: show.yellow,
    green: show.green,
    zero: show.missing,
    null: show.missing,
  };
  const filters = {};
  for (const key of DRAW_ORDER) {
    filters[`points-${key}`] = bandOn[key] ? ["all", bands[key], ...shared] : HIDDEN;
  }
  // The violation ring follows the same category, search and date filters as the pins.
  filters[RING_LAYER] = ["all", ["==", ["get", "has_any_violation"], true], ...shared];
  // The ringed places' wider tap target follows the ring exactly.
  filters[HIT_LAYER] = filters[RING_LAYER];
  return filters;
}
