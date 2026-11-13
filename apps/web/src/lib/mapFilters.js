// MapLibre filter expressions for the pin and violation-ring layers, built from the
// filter panel's state. Pure: no React, no map. features/map/mapLayers.js applies them.
import { HIT_LAYER, RING_LAYER } from "./pinPicking.js";
import { bandExprs } from "./scoring.js";
import { CATEGORY_SPECS, allCategoriesOn } from "./categories.js";
import { DRAW_ORDER } from "./constants.js";
import { searchTokens } from "./searchText.js";
import { DEFAULT_REGION, undatedRegionIds, untypedRegionIds } from "./regions.js";

// Matches no feature: the filter for a score band that is switched off.
export const HIDDEN = ["==", ["get", "score"], "__none__"];

// Forgiving match (lib/searchText.js): every word of the term must appear in the pin's
// search_key, which holds the name, addresses and zip of every place sharing the pin
// (lib/dedupe.js), compacted to letters and digits. So "mc donald's", "mcdonalds" and
// "mc'donalds" all find McDonald's. null when the term is blank.
export function searchExpression(searchTerm) {
  const tokens = searchTokens(searchTerm);
  if (!tokens.length) return null;
  const haystack = ["coalesce", ["get", "search_key"], ""];
  const has = (t) => [">=", ["index-of", t, haystack], 0];
  return tokens.length === 1 ? has(tokens[0]) : ["all", ...tokens.map(has)];
}

// A pin's county. Pins without a region are Louisville's (older cached data has none).
const regionOf = ["coalesce", ["get", "region"], DEFAULT_REGION];

// Hides pins inspected before the cutoff (YYYY-MM-DD). Pins with no date are hidden
// whenever a cutoff is set, except in counties whose data doesn't always publish one
// (undatedRegions, e.g. Bullitt when its results come from the county's sheet): an
// undated pin there shows the latest inspection, so it stays. A dated pin in such a
// county is filtered like any other. null for "All time".
export function dateExpression(cutoffDate, undatedRegions = []) {
  if (!cutoffDate) return null;
  const recent = [">=", ["coalesce", ["get", "date"], "0000-00-00"], cutoffDate];
  if (!undatedRegions.length) return recent;
  const noDate = ["==", ["coalesce", ["get", "date"], ""], ""];
  const undated = ["all", ["in", regionOf, ["literal", undatedRegions]], noDate];
  return ["any", undated, recent];
}

// Pins whose facility type/subtype pair is switched on in the category filter, plus
// uncategorised pins when "Other / Unknown" is on. (Counties without facility types are
// handled by categoryFilter.)
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

// The category filter for every county. Counties whose data has no facility types
// (untypedRegions, e.g. Bullitt) can't say whether a place is a school or a restaurant,
// so categories don't apply to them: their pins always show, and the Filter tab lists
// them apart from the category tiles, with a note saying so (FilterSearch.jsx).
export function categoryFilter(catToggles, untypedRegions = []) {
  const expr = categoryExpression(catToggles);
  if (!untypedRegions.length || allCategoriesOn(catToggles)) return expr;
  return ["any", ["in", regionOf, ["literal", untypedRegions]], expr];
}

/**
 * Filter expression for every pin and ring layer, keyed by layer id.
 * @param {object} filters
 * @param {[number, number]} filters.pins  red and yellow cut-offs (lib/scoring.js)
 * @param {{red: boolean, yellow: boolean, green: boolean, missing: boolean}} filters.show
 *   which score bands are switched on ("missing" covers zero and no score)
 * @param {object|null} filters.catToggles  category filter state (lib/categories.js), or
 *   null for a county without categories
 * @param {string} filters.searchTerm
 * @param {string|null} filters.cutoffDate  YYYY-MM-DD, or null for all time
 * @param {string[]} [filters.undatedRegions]  counties the date filter lets through
 *   (defaults to those whose data has no dates, lib/regions.js)
 * @param {string[]} [filters.untypedRegions]  counties categories don't apply to, whose
 *   pins always show (defaults to those whose data has no facility types)
 */
export function buildLayerFilters({
  pins,
  show,
  catToggles,
  searchTerm,
  cutoffDate,
  undatedRegions = undatedRegionIds(),
  untypedRegions = untypedRegionIds(),
}) {
  const bands = bandExprs(pins);
  const shared = [];
  if (catToggles) shared.push(categoryFilter(catToggles, untypedRegions));
  const search = searchExpression(searchTerm);
  if (search) shared.push(search);
  const date = dateExpression(cutoffDate, undatedRegions);
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
