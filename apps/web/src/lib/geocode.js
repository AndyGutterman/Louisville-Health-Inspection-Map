// Address autocomplete helpers for Geoapify. Everything here is pure except the
// fetch call, which tests can swap out.

// Louisville Metro, roughly. Results outside this box are dropped.
export const BOUNDS = { w: -86.15, s: 37.85, e: -85.3, n: 38.5 };
export const CENTER = { lon: -85.7585, lat: 38.2527 };

export const inBounds = (lat, lon) =>
  lat >= BOUNDS.s && lat <= BOUNDS.n && lon >= BOUNDS.w && lon <= BOUNDS.e;

export function buildAutocompleteUrl(q, key) {
  const url = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
  url.searchParams.set("text", q);
  url.searchParams.set("filter", `rect:${BOUNDS.w},${BOUNDS.s},${BOUNDS.e},${BOUNDS.n}`);
  url.searchParams.set("bias", `proximity:${CENTER.lon},${CENTER.lat}`);
  url.searchParams.set("limit", "5");
  url.searchParams.set("lang", "en");
  url.searchParams.set("apiKey", key);
  return url;
}

// Turns Geoapify features into the suggestions the picker shows. `upstream` is how
// many Geoapify returned before the bounds check, so the UI can tell "nothing found"
// from "found places, but none in Louisville Metro".
export function parseSuggestions(features) {
  const results = features
    .map((f) => f.properties)
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && inBounds(p.lat, p.lon))
    .map((p) => ({
      address: p.formatted,
      primary: p.address_line1 || p.name || p.formatted,
      secondary: p.address_line2 || "",
      lat: p.lat,
      lon: p.lon,
    }));
  return { results, upstream: features.length };
}

export async function searchAddresses(q, { key, signal, fetchFn = fetch } = {}) {
  const res = await fetchFn(buildAutocompleteUrl(q, key), { signal });
  if (!res.ok) throw Object.assign(new Error(`Geoapify ${res.status}`), { code: "error" });
  const data = await res.json();
  return parseSuggestions(data.features || []);
}
