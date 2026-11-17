// The Filter tab's categories: which are switched on, what a first visit loads, and the
// database filter for them. The categories themselves (which facility types make up
// "Restaurants") are shared with the pipeline: @lfs/core/categories.js.
import { CATEGORY_KEYS, CATEGORY_SPECS, classifyCategory } from "@lfs/core/categories.js";

export { CATEGORY_KEYS, CATEGORY_SPECS, classifyCategory };

export function buildInitialCatToggles() {
  const obj = {};
  for (const [key, spec] of Object.entries(CATEGORY_SPECS)) {
    const subs = {};
    for (const p of spec.subs) subs[`${p.ft}:${p.st}`] = true;
    obj[key] = { enabled: true, subs };
  }
  return obj;
}

// True when every category and every subtype in it is switched on (the default).
export function allCategoriesOn(catToggles) {
  return Object.entries(CATEGORY_SPECS).every(([key, spec]) => {
    const t = catToggles?.[key];
    return !!t?.enabled && spec.subs.every((p) => t.subs?.[`${p.ft}:${p.st}`]);
  });
}

// The categories switched on, and so loaded, on a first visit: about 80% of Louisville's
// places. The rest load when their tile is first tapped (features/map/useMapFeatures.js),
// so a visitor only costs the database the kinds of place they look at.
export const DEFAULT_CATEGORIES = ["restaurants", "retail", "caterers_commissary"];

/** Filter-panel state with exactly these categories switched on. */
export function buildCatToggles(onKeys) {
  const obj = {};
  for (const [key, spec] of Object.entries(CATEGORY_SPECS)) {
    const on = onKeys.includes(key);
    const subs = {};
    for (const p of spec.subs) subs[`${p.ft}:${p.st}`] = on;
    obj[key] = { enabled: on, subs };
  }
  return obj;
}

/** The keys of the categories switched on, in the panel's order. */
export const enabledCategories = (catToggles) =>
  CATEGORY_KEYS.filter((key) => catToggles?.[key]?.enabled);

export const CATEGORY_CHOICE_KEY = "lfs_categories";

/**
 * The categories a returning visitor left switched on (an empty list is a choice too),
 * or the default when nothing is saved or it's unreadable.
 */
export function readCategoryChoice(storage) {
  try {
    const saved = JSON.parse(storage.getItem(CATEGORY_CHOICE_KEY));
    if (Array.isArray(saved)) return CATEGORY_KEYS.filter((k) => saved.includes(k));
  } catch {
    /* no storage, or not JSON */
  }
  return DEFAULT_CATEGORIES;
}

/** Saves the choice. False if it couldn't be saved (storage blocked or full). */
export function writeCategoryChoice(storage, keys) {
  try {
    storage.setItem(CATEGORY_CHOICE_KEY, JSON.stringify(keys));
    return true;
  } catch {
    return false;
  }
}

const pairIs = (p) => `and(facility_type.eq.${p.ft},subtype.eq.${p.st})`;

/**
 * The PostgREST `or` filter that matches the places of these categories, by facility
 * type and subtype; null when that is every place (no filter needed). "unknown" is
 * every place no other category claims, including those with no type at all, exactly as
 * classifyCategory files them.
 */
export function categoryOrFilter(keys) {
  if (CATEGORY_KEYS.every((k) => keys.includes(k))) return null;
  const claimed = (ks) => ks.flatMap((k) => CATEGORY_SPECS[k].subs.map(pairIs));
  const parts = claimed(keys.filter((k) => k !== "unknown"));
  if (keys.includes("unknown")) {
    const known = claimed(CATEGORY_KEYS.filter((k) => k !== "unknown"));
    parts.push("facility_type.is.null", "subtype.is.null", `not.or(${known.join(",")})`);
  }
  return parts.join(",");
}
