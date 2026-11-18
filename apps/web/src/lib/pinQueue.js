// The pin control center's rules (/?page=pins, features/pins, docs/PINS.md). Pure: the
// queues and their names, what a fix sends to the database, and how long the page
// watches a Geocode now run.
import { inKentucky, parseLatLon } from "@lfs/core/coords.js";
import { REGIONS } from "./regions.js";

// Every place is in at most one queue (the database decides: v_admin_pin_rows.bucket,
// migration 20261130000000). In tab order; `todo` queues need a decision.
export const BUCKETS = [
  { key: "missing", label: "No pin", todo: true },
  { key: "retry", label: "Still not found", todo: true },
  { key: "outside", label: "Outside county", todo: true },
  { key: "approx", label: "Approximate", todo: true },
  { key: "pending", label: "Waiting", todo: false },
  { key: "fixed", label: "Fixed", todo: false },
  { key: "skipped", label: "Skipped", todo: false },
  { key: "hidden", label: "Left off map", todo: false },
];
export const bucketLabel = (key) => BUCKETS.find((b) => b.key === key)?.label ?? key;

export const PAGE_SIZE = 25;

/** admin_pin_counts rows -> { [region]: { [bucket]: n } }. */
export function countsByRegion(rows = []) {
  const out = {};
  for (const { region, bucket, n } of rows) {
    out[region] ??= {};
    out[region][bucket] = Number(n);
  }
  return out;
}

/** How many places in a county's counts still need a decision. */
export const todoCount = (counts = {}) =>
  BUCKETS.filter((b) => b.todo).reduce((sum, b) => sum + (counts[b.key] ?? 0), 0);

/** Fixes waiting for the pin-fixes job, across every county. */
export const pendingCount = (byRegion = {}) =>
  Object.values(byRegion).reduce((sum, c) => sum + (c.pending ?? 0), 0);

/**
 * The counties to offer, in the site's order (lib/regions.js), then any the database has
 * that the site doesn't list yet (a new portal county), so none is ever out of reach.
 */
export function regionChoices(byRegion = {}) {
  const known = REGIONS.map((r) => ({ id: r.id, name: r.shortName ?? r.name }));
  const extra = Object.keys(byRegion)
    .filter((id) => !known.some((k) => k.id === id))
    .sort()
    .map((id) => ({ id, name: id[0].toUpperCase() + id.slice(1) }));
  return [...known, ...extra].map((r) => ({
    ...r,
    todo: todoCount(byRegion[r.id]),
    counts: byRegion[r.id] ?? {},
  }));
}

/** The first queue with something in it: where a county opens. */
export const firstBucket = (counts = {}) =>
  (BUCKETS.find((b) => b.todo && counts[b.key] > 0) ?? BUCKETS[0]).key;

/** The county's [[west, south], [east, north]], from lib/regions.js, or null. */
export const regionBounds = (id) => REGIONS.find((r) => r.id === id)?.bounds ?? null;
export const regionOutlineUrl = (id) =>
  REGIONS.find((r) => r.id === id)?.boundaryUrl ?? `/regions/${id}.geojson`;

/** Is the point inside the county's box (a quick warning; the outline is the rule)? */
export function inRegionBox(id, { lon, lat }) {
  const b = regionBounds(id);
  if (!b) return true;
  const pad = 0.02; // about 2 km, as the pipeline's search box
  return (
    lon >= b[0][0] - pad && lon <= b[1][0] + pad && lat >= b[0][1] - pad && lat <= b[1][1] + pad
  );
}

/** The address as the source lists it, on one line. */
export const sourceLine = (p) =>
  [p.source_address ?? p.address, p.source_city ?? p.city].filter(Boolean).join(", ");

/** What the editor starts with: the saved correction, or the source's own words. */
export const editorStart = (p) => ({
  address: p.fix_address ?? p.address ?? "",
  city: p.fix_city ?? p.city ?? "",
  note: p.fix_note ?? "",
});

/**
 * Where the editor's marker starts, and what it is:
 *   "fix"    the admin's own pin
 *   "found"  what the pin-fixes job found (outside the county: "outside", drawn faded)
 *   "now"    the place's current pin
 * null when the place has no pin of any kind (the map then shows the county).
 */
export function startPin(p) {
  if (p.fix_action === "pin" && p.fix_lon != null)
    return { lon: p.fix_lon, lat: p.fix_lat, kind: "fix" };
  if (p.result_lon != null) {
    return {
      lon: p.result_lon,
      lat: p.result_lat,
      kind: p.fix_status === "outside" ? "outside" : "found",
    };
  }
  if (p.lon != null) return { lon: p.lon, lat: p.lat, kind: "now" };
  return null;
}

/** Where the current pin came from, in words. */
export function pinSource(p) {
  if (p.lon == null) return "No pin";
  if (p.provider === "manual") return "Placed by hand";
  if (!p.provider) return p.region === "jefferson" ? "Louisville Metro's data" : "Unknown";
  const names = {
    census: "US Census geocoder",
    nominatim: "OpenStreetMap",
    ky911: "Kentucky 911 address point",
    "ky911-approx": "Kentucky 911, between neighbouring numbers",
  };
  return names[p.provider] ?? p.provider;
}

/** The outcome of an address fix, in words, or null for a fix that isn't one. */
export function outcomeText(p) {
  if (p.fix_action !== "address") return null;
  switch (p.fix_status) {
    case "pending":
      return "Waiting for Geocode now";
    case "found":
      return `Found (${pinSource({ ...p, lon: p.result_lon, provider: p.result_provider })})`;
    case "outside":
      return "Found, but outside the county: not put on the map";
    case "not_found":
      return "Not found: place the pin by hand";
    default:
      return null;
  }
}

/**
 * The admin_save_place_fix arguments for one fix, or { error } saying what is missing.
 * @param {"address"|"pin"|"hide"|"skip"} action
 * @param {object} place  a queue row
 * @param {object} form   { address, city, note, point: { lon, lat } | null, also: string[] }
 */
export function fixArgs(
  action,
  place,
  { address = "", city = "", note = "", point = null, also = [] },
) {
  const args = {
    p_place_id: place.id,
    p_action: action,
    p_note: note.trim() || null,
    p_also: also,
  };
  if (action === "address") {
    const a = address.trim();
    const c = city.trim();
    const same = (x, y) => (x ?? "").trim().toUpperCase() === (y ?? "").trim().toUpperCase();
    if (!a && !c) return { error: "Type the corrected address or town." };
    if (same(a, place.address) && same(c, place.city)) {
      return { error: "That is the address the source already has: change it first." };
    }
    return { ...args, p_address: a || null, p_city: c || null };
  }
  if (action === "pin") {
    if (!point || !inKentucky(point))
      return { error: "Put the pin on the map, or paste a latitude, longitude." };
    return { ...args, p_lon: round(point.lon), p_lat: round(point.lat) };
  }
  return args;
}
const round = (x) => Math.round(x * 1e6) / 1e6; // about 10 cm

/** A pasted "latitude, longitude" -> { point } or { error }. */
export function readPasted(text) {
  try {
    const point = parseLatLon(text);
    return point ? { point } : { error: null };
  } catch (e) {
    return { error: e.message };
  }
}

/** A search for the place on Google Maps, to check where it really is. */
export const mapsSearchUrl = (p) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    [p.name, p.address, p.city, "KY"].filter(Boolean).join(", "),
  )}`;

export const PIN_JOB_URL =
  "https://github.com/AndyGutterman/Louisville-Health-Inspection-Map/actions/workflows/pin-fixes.yml";

/** What the page says after Geocode now: api/dispatch.js's answer, for `n` fixes. */
export function jobNotice(result, n, whyNotStarted) {
  if (result.started) {
    return {
      ok: true,
      text: `Looking up ${n} address ${n === 1 ? "fix" : "fixes"}. Each one shows below as it comes back, usually within two minutes.`,
    };
  }
  return {
    ok: false,
    text: `The lookup didn't start (${whyNotStarted(result.reason)}). Start it by hand:`,
  };
}

/** How the marker on the pin map is drawn, by where its point came from (startPin). */
export const MARKER_COLORS = {
  new: "#34d399", // just placed by the admin
  pasted: "#34d399",
  fix: "#34d399",
  found: "#60a5fa",
  outside: "#f59e0b",
  now: "#9ca3af",
};

// Watching a Geocode now run: a small read every 10 s, for at most 5 minutes (a run
// takes one to three), and not at all once nothing is waiting.
export const POLL_MS = 10_000;
export const POLL_MAX_MS = 5 * 60_000;
export const keepPolling = ({ startedAt, now, statuses }) =>
  now - startedAt < POLL_MAX_MS && statuses.some((s) => s === "pending");
