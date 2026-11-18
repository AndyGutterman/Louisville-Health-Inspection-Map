// The Filter tab's category tiles (features/filters/FilterTab.jsx): their short labels,
// and the toggle state with every category off. (Every category on is
// buildInitialCatToggles in lib/categories.js.)

/** A category's label, short enough for its tile. */
export function shortCategoryLabel(label) {
  if (/Hospitals/i.test(label)) return "Healthcare";
  if (/Caterers/i.test(label)) return "Kitchens";
  if (/Other/i.test(label)) return "Other";
  return label;
}

/**
 * Every category off, each of its (facility type, subtype) pairs too.
 * @param {Record<string, { subs: { ft: number, st: number }[] }>} specs  CATEGORY_SPECS
 */
export function allCategoriesOff(specs) {
  const off = {};
  for (const [k, spec] of Object.entries(specs)) {
    const subs = {};
    for (const p of spec.subs) subs[`${p.ft}:${p.st}`] = false;
    off[k] = { enabled: false, subs };
  }
  return off;
}
