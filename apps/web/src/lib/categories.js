// Facility categories. A category is a set of (facility type, subtype) pairs
// from the Louisville Metro inspection data. Listed in the order the Filter tab shows
// them: the three most people come for first.

export const CATEGORY_SPECS = {
  restaurants: { label: "Restaurants", subs: [{ ft: 605, st: 11 }] },
  retail: {
    label: "Retail",
    subs: [
      { ft: 610, st: 61 },
      { ft: 610, st: 62 },
      { ft: 610, st: 63 },
      { ft: 610, st: 64 },
      { ft: 610, st: 65 },
      { ft: 610, st: 73 },
      { ft: 610, st: 212 },
      { ft: 607, st: 54 },
      { ft: 607, st: 55 },
      { ft: 605, st: 54 },
    ],
  },
  caterers_commissary: {
    label: "Caterers & Commissaries",
    subs: [
      { ft: 605, st: 42 },
      { ft: 605, st: 43 },
    ],
  },
  schools: { label: "Schools", subs: [{ ft: 605, st: 33 }] },
  daycare: { label: "Daycare", subs: [{ ft: 605, st: 31 }] },
  hospitals: { label: "Hospitals & Nursing", subs: [{ ft: 605, st: 32 }] },
  concessions: {
    label: "Concessions",
    subs: [
      { ft: 603, st: 51 },
      { ft: 603, st: 53 },
    ],
  },
  unknown: {
    label: "Other / Unknown",
    subs: [
      { ft: 605, st: 36 },
      { ft: 604, st: 16 },
      { ft: 605, st: 52 },
    ],
  },
};

export function classifyCategory(ft, st) {
  for (const [key, spec] of Object.entries(CATEGORY_SPECS)) {
    if (key === "unknown") continue;
    if (spec.subs.some((p) => p.ft === ft && p.st === st)) return key;
  }
  return "unknown";
}

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

export const CATEGORY_KEYS = Object.keys(CATEGORY_SPECS);

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
