/**
 * coords.js — reading a pin typed or pasted by hand, for the pipeline's hand-placed pins
 * and the pin control center (/?page=pins). Pure.
 *
 * The format is "latitude, longitude", as Google Maps and OpenStreetMap copy it
 * ("38.30833, -85.49152"). Anything outside roughly Kentucky is refused, which catches
 * the usual mistake of pasting the two numbers the other way round.
 */

// Roughly Kentucky, with a little slack. The database checks the same box
// (place_fixes, migration 20261130000000).
export const KY_BOX = { lat: [36.4, 39.2], lon: [-89.6, -81.9] };

/** Is { lon, lat } inside KY_BOX? */
export const inKentucky = ({ lon, lat }) =>
  Number.isFinite(lat) &&
  Number.isFinite(lon) &&
  lat >= KY_BOX.lat[0] &&
  lat <= KY_BOX.lat[1] &&
  lon >= KY_BOX.lon[0] &&
  lon <= KY_BOX.lon[1];

/**
 * "38.05563, -85.53856" -> { lat, lon }. Empty -> null (not filled in yet).
 * Throws on anything else, saying what was wrong.
 */
export function parseLatLon(text) {
  const s = String(text ?? "").trim();
  if (!s) return null;
  const m = s.match(/^\(?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)?$/);
  if (!m) throw new Error(`"${s}" is not "latitude, longitude"`);
  const point = { lat: Number(m[1]), lon: Number(m[2]) };
  if (!inKentucky(point)) {
    throw new Error(`"${s}" is not in Kentucky (latitude first, then longitude)`);
  }
  return point;
}

/** { lon, lat } -> "38.30833, -85.49152" (five decimals: about a metre). */
export const formatLatLon = ({ lon, lat }) => `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
