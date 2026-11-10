// PostgREST filter strings for Table View (TableView.jsx), which reads v_table_latest or
// v_table_inspections (supabase/migrations/20261111000000_both_counties.sql). Pure.

// Facility chips: (facility type, subtype) pairs, as in lib/categories.js. "Other" also
// takes places with no type at all, which is every Bullitt County place.
export const FACILITY_CATS = {
  restaurants: { label: "Restaurants", pairs: [[605, 11]] },
  schools: { label: "Schools", pairs: [[605, 33]] },
  daycare: { label: "Daycare", pairs: [[605, 31]] },
  hospitals: { label: "Healthcare", pairs: [[605, 32]] },
  concessions: {
    label: "Concessions",
    pairs: [
      [603, 51],
      [603, 53],
    ],
  },
  caterers_commissary: {
    label: "Kitchens",
    pairs: [
      [605, 42],
      [605, 43],
    ],
  },
  retail: {
    label: "Retail",
    pairs: [
      [610, 61],
      [610, 62],
      [610, 63],
      [610, 64],
      [610, 65],
      [610, 73],
      [610, 212],
      [607, 54],
      [607, 55],
      [605, 54],
    ],
  },
  unknown: {
    label: "Other",
    pairs: [
      [605, 36],
      [604, 16],
      [605, 52],
    ],
    untyped: true,
  },
};
export const FACILITY_CAT_KEYS = Object.keys(FACILITY_CATS);

// The search box text, safe inside a PostgREST or=(...) list: commas, parentheses,
// quotes, backslashes and the * and % wildcards would change the filter's meaning.
export const cleanSearch = (term) =>
  String(term ?? "")
    .replace(/[,()"'\\*%:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Matches the term in the name, street, city or zip. null for an empty term.
export function searchFilter(term) {
  const t = cleanSearch(term);
  if (!t) return null;
  return ["name", "address", "city", "zip"].map((col) => `${col}.ilike.*${t}*`).join(",");
}

// Matches the selected facility chips. null when no chip is picked (all facilities).
export function facilityFilter(selected) {
  if (!selected || selected.size === 0) return null;
  const parts = [];
  for (const key of selected) {
    const spec = FACILITY_CATS[key];
    if (!spec) continue;
    for (const [ft, st] of spec.pairs) parts.push(`and(facility_type.eq.${ft},subtype.eq.${st})`);
    if (spec.untyped) parts.push("facility_type.is.null");
  }
  return parts.length ? parts.join(",") : null;
}

// One value for supabase-js's .or(): PostgREST takes a single `or` parameter, so two
// lists that must both match are wrapped as and(or(...),or(...)). null when both are empty.
export function combineOr(...lists) {
  const present = lists.filter(Boolean);
  if (present.length === 0) return null;
  if (present.length === 1) return present[0];
  return `and(${present.map((l) => `or(${l})`).join(",")})`;
}

// Everything that changes which rows match (not the page). Table View asks the database
// for a row count only when this changes, since counting runs the whole query again.
export const countKey = (f) =>
  JSON.stringify([
    f.view,
    f.region ?? null,
    f.hideNA,
    f.types ? [...f.types].sort() : null,
    f.cats ? [...f.cats].sort() : null,
    cleanSearch(f.search),
  ]);
