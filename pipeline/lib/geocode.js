/**
 * lib/geocode.js — address -> coordinates, shared by every county's pipeline.
 *
 * Nominatim (OpenStreetMap) first, then the US Census Bureau geocoder. Neither needs an
 * API key. Nominatim's terms allow at most one request a second: callers wait
 * DELAY_MS between lookups.
 */
import fetch from "node-fetch";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const CENSUS = "https://geocoding.geo.census.gov/geocoder/locations/address";
const CENSUS_LINE = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";
export const USER_AGENT = "LouisvilleFoodSafe/1.0 (louisvillefoodsafe.netlify.app)";
export const DELAY_MS = 1100;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Strip suite/unit qualifiers that confuse geocoders
// "123 MAIN ST STE 104" → "123 MAIN ST". Only whole words count: "123 FLOYD ST" and
// "6434 NORTH PRESTON HWY" keep their street names.
export function stripSuite(addr) {
  return addr
    .replace(
      /\s+(?:#|(?:STE|SUITE|APT|UNIT|BLDG|FL|FLOOR|RM|ROOM|BOX|PMB|NUM|NO)\b\.?)[\s#\w&-]*/gi,
      "",
    )
    .trim();
}

// "street, city, state, zip" for Nominatim, with the county's defaults for a missing
// city or state. Empty parts are skipped.
export function buildQuery(row, { city = "", state = "" } = {}) {
  const street = stripSuite(row.address || "");
  return [street, row.city || city, row.state || state, row.zip || ""].filter(Boolean).join(", ");
}

// The geocode_cache key for a query.
export function cacheKey(query) {
  return query.toLowerCase().replace(/\s+/g, " ").trim();
}

// Nominatim answers an address it can't find with the nearest thing it can: the street,
// the town, the zip code. Those points are nowhere near the place (every address on a
// road gets the same pin), so only a match on the building itself counts: a house, a
// building, or a shop or other place at that address.
const NOT_A_BUILDING = new Set([
  "highway",
  "boundary",
  "landuse",
  "natural",
  "waterway",
  "railway",
]);
export function isBuildingMatch(hit) {
  if (!hit) return false;
  if (NOT_A_BUILDING.has(hit.class)) return false;
  if (hit.class === "place") return hit.type === "house";
  return true;
}

/**
 * Nominatim search. With `viewbox` ([west, south, east, north]) only results inside
 * that box are returned. Street-, town- and zip-level answers count as no match
 * (isBuildingMatch).
 */
export async function geocodeNominatim(query, { viewbox } = {}) {
  const params = { q: query, format: "json", limit: "1", countrycodes: "us", addressdetails: "0" };
  if (viewbox) Object.assign(params, { viewbox: viewbox.join(","), bounded: "1" });
  const res = await fetch(`${NOMINATIM}?${new URLSearchParams(params)}`, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" },
  });
  if (!res.ok) {
    console.error(`Nominatim HTTP ${res.status}`);
    return null;
  }

  const json = await res.json();
  if (!Array.isArray(json) || !json.length) return null;

  const hit = json[0];
  if (!isBuildingMatch(hit)) return null;
  return {
    lon: parseFloat(hit.lon),
    lat: parseFloat(hit.lat),
    confidence: parseFloat(hit.importance ?? 0),
    provider: "nominatim",
    raw: hit,
  };
}

// US Census Bureau geocoder: structured address, excellent for US streets.
export async function geocodeCensus(row, { city = "", state = "" } = {}) {
  const url =
    `${CENSUS}?` +
    new URLSearchParams({
      street: stripSuite(row.address || ""),
      city: row.city || city,
      state: row.state || state,
      zip: row.zip || "",
      benchmark: "Public_AR_Current",
      format: "json",
    });

  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    console.error(`Census HTTP ${res.status} for "${row.address}"`);
    return null;
  }

  const json = await res.json();
  const match = json?.result?.addressMatches?.[0];
  if (!match) return null;

  return {
    lon: match.coordinates.x,
    lat: match.coordinates.y,
    confidence: 1.0,
    provider: "census",
    raw: match,
  };
}

/**
 * Census geocoder from one line of text, for when the town may be wrong ("6340 HWY 44 E,
 * KY"). Several places can match; `accept` ({ lon, lat } -> boolean) picks the first
 * one it approves.
 */
export async function geocodeCensusLine(text, { accept = () => true } = {}) {
  const url = `${CENSUS_LINE}?${new URLSearchParams({ address: text, benchmark: "Public_AR_Current", format: "json" })}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    console.error(`Census HTTP ${res.status} for "${text}"`);
    return null;
  }
  const json = await res.json();
  const match = (json?.result?.addressMatches || []).find((m) =>
    accept({ lon: m.coordinates.x, lat: m.coordinates.y }),
  );
  if (!match) return null;
  return {
    lon: match.coordinates.x,
    lat: match.coordinates.y,
    confidence: 1.0,
    provider: "census",
    raw: match,
  };
}

/**
 * Tries each geocoder in turn and returns the first result inside the area
 * (`inside(result)`). If none is inside, the first result found at all, so it can be
 * pinned and flagged. A geocoder that throws counts as no match.
 * @param {Array<() => Promise<object|null>>} attempts
 */
export async function firstInside(attempts, inside, { onError = () => {} } = {}) {
  let first = null;
  for (const attempt of attempts) {
    let result = null;
    try {
      result = await attempt();
    } catch (e) {
      onError(e);
    }
    if (result && inside(result)) return result;
    first ??= result;
  }
  return first;
}
