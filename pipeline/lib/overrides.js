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
import { buildQuery, cacheKey } from "./geocode.js";

// Roughly Kentucky: catches swapped or mistyped coordinates.
const LAT = [36.4, 39.2];
const LON = [-89.6, -81.9];

// "38.05563, -85.53856" -> { lat, lon }. Empty -> null (not filled in yet).
export function parseLatLon(text) {
  const s = String(text ?? "").trim();
  if (!s) return null;
  const m = s.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) throw new Error(`"${s}" is not "latitude, longitude"`);
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (lat < LAT[0] || lat > LAT[1] || lon < LON[0] || lon > LON[1]) {
    throw new Error(`"${s}" is not in Kentucky (latitude first, then longitude)`);
  }
  return { lat, lon };
}

// The map key for a query, or for a query and a place's name.
const keyOf = (query, name) => (name ? `${cacheKey(query)}|${cacheKey(name)}` : cacheKey(query));

// overrides.json -> Map(key -> { lat, lon, note }). Entries without coordinates are
// skipped. A malformed entry throws, naming it.
export function parseOverrides(json) {
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
    if (!point) continue;
    if (map.has(key)) {
      throw new Error(
        `overrides.json: ${[o.name, o.query].filter(Boolean).join(", ")} is listed twice`,
      );
    }
    map.set(key, { ...point, note: o.note ?? "" });
  }
  return map;
}

// The hand-placed pin for an establishment row ({ name, address, city, ... }), or null.
export function overrideFor(overrides, row, defaults) {
  const query = buildQuery(row, defaults);
  return (row.name && overrides.get(keyOf(query, row.name))) || overrides.get(keyOf(query)) || null;
}
