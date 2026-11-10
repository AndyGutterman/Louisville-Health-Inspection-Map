// Map constants shared by the map code.

// Draw order for the five score-band circle layers (bottom to top).
export const DRAW_ORDER = ["null", "green", "yellow", "zero", "red"];

// The zoom level the map starts at.
export const MIN_ZOOM = 11;

// Pixel width of the screen edge that triggers auto-panning while dragging.
export const EDGE_ZONE = 24;

// "Since X" options for the date filter on the map.
export const DATE_FILTER_OPTS = [
  { key: "1w", label: "1 week", days: 7 },
  { key: "1mo", label: "1 month", days: 30 },
  { key: "3mo", label: "3 months", days: 91 },
  { key: "6mo", label: "6 months", days: 182 },
  { key: "1yr", label: "1 year", days: 365 },
  { key: "all", label: "All time", days: null },
];

// Map data is cached in localStorage. Change the key to force everyone to reload.
export const GEO_CACHE_KEY = "lfs_geodata_v5"; // bumped: pins now include Bullitt County
export const GEO_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
