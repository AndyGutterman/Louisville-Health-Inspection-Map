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
export const USER_AGENT = "LouisvilleFoodSafe/1.0 (louisvillefoodsafe.netlify.app)";
export const DELAY_MS = 1100;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Strip suite/unit qualifiers that confuse geocoders
// "123 MAIN ST STE 104" → "123 MAIN ST"
export function stripSuite(addr) {
  return addr
    .replace(/\s+(STE|SUITE|APT|UNIT|#|BLDG|FL|FLOOR|RM|ROOM|BOX|PMB|NUM|NO\.?)[\s#\w&-]*/gi, "")
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

/**
 * Nominatim search. With `viewbox` ([west, south, east, north]) only results inside
 * that box are returned.
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
