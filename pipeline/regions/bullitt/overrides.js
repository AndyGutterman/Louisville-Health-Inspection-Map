/**
 * regions/bullitt/overrides.js — pins placed by hand (overrides.json) for the few
 * addresses no geocoder finds. Pure.
 *
 * Each entry names the geocoding query exactly as the job's "✗ no match" line prints it,
 * so every place at that address (two businesses in one strip mall) gets the pin.
 */
import { buildQuery, cacheKey } from "../../lib/geocode.js";

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

// overrides.json -> Map(cache key of the query -> { lat, lon, note }). Entries without
// coordinates are skipped. A malformed entry throws, naming it.
export function parseOverrides(json) {
  const map = new Map();
  for (const [i, o] of (json?.places ?? []).entries()) {
    if (!o?.query) throw new Error(`overrides.json: place ${i + 1} has no "query"`);
    const key = cacheKey(o.query);
    let point;
    try {
      point = parseLatLon(o.at);
    } catch (e) {
      throw new Error(`overrides.json, ${o.query}: ${e.message}`);
    }
    if (!point) continue;
    if (map.has(key)) throw new Error(`overrides.json: ${o.query} is listed twice`);
    map.set(key, { ...point, note: o.note ?? "" });
  }
  return map;
}

// The hand-placed pin for an establishment row, or null.
export const overrideFor = (overrides, row, defaults) =>
  overrides.get(cacheKey(buildQuery(row, defaults))) ?? null;
