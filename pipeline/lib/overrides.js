/**
 * lib/overrides.js — pins placed by hand (a county's overrides.json) for the few
 * addresses no geocoder finds. Pure.
 *
 * Each entry names the geocoding query exactly as the job's "✗ no match" line prints it,
 * so every place at that address (two businesses in one strip mall) gets the pin. An
 * entry that also gives the place's `name` pins only that place: for an address with no
 * house number ("LA GRANGE, KY", which two prisons share), the query alone could stand for
 * anywhere in town. A named entry wins over an unnamed one for the same query.
 */
import { parseLatLon } from "@lfs/core/coords.js";
import { buildQuery, cacheKey } from "./geocode.js";

// Shared with the pin control center (packages/core/coords.js).
export { parseLatLon };

// The map key for a query, or for a query and a place's name.
const keyOf = (query, name) => (name ? `${cacheKey(query)}|${cacheKey(name)}` : cacheKey(query));

// overrides.json -> Map(key -> { lat, lon, note }). Entries without coordinates are
// skipped, unless withHidden: then they are { hidden: true, note } (left off the map on
// purpose; pins/import_json.js moves them into place_fixes). A malformed entry throws,
// naming it.
export function parseOverrides(json, { withHidden = false } = {}) {
  const map = new Map();
  for (const [i, o] of (json?.places ?? []).entries()) {
    if (!o?.query) throw new Error(`overrides.json: place ${i + 1} has no "query"`);
    const key = keyOf(o.query, o.name);
    let point;
    try {
      point = parseLatLon(o.at);
    } catch (e) {
      throw new Error(`overrides.json, ${o.query}: ${e.message}`);
    }
    if (!point && !withHidden) continue;
    if (map.has(key)) {
      throw new Error(
        `overrides.json: ${[o.name, o.query].filter(Boolean).join(", ")} is listed twice`,
      );
    }
    map.set(key, point ? { ...point, note: o.note ?? "" } : { hidden: true, note: o.note ?? "" });
  }
  return map;
}

// The key of the entry for an establishment row ({ name, address, city, ... }), or null:
// one naming the place wins over one for its whole address.
export function overrideKeyFor(overrides, row, defaults) {
  const query = buildQuery(row, defaults);
  const named = row.name && keyOf(query, row.name);
  if (named && overrides.has(named)) return named;
  return overrides.has(keyOf(query)) ? keyOf(query) : null;
}

// The hand-placed pin for an establishment row, or null.
export function overrideFor(overrides, row, defaults) {
  const key = overrideKeyFor(overrides, row, defaults);
  return key ? overrides.get(key) : null;
}
