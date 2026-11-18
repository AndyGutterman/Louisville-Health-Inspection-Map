// Map constants shared by the map code.

// Draw order for the five score-band circle layers (bottom to top).
export const DRAW_ORDER = ["null", "green", "yellow", "zero", "red"];

// The zoom level the map starts at.
export const MIN_ZOOM = 11;

// Pixel width of the screen edge that triggers auto-panning while dragging.
export const EDGE_ZONE = 24;

// "Since X" options (labelKey is the translated label; label is the English) for the date filter on the map.
export const DATE_FILTER_OPTS = [
  { key: "1w", labelKey: "filters.date.1w", label: "1 week", days: 7 },
  { key: "1mo", labelKey: "filters.date.1mo", label: "1 month", days: 30 },
  { key: "3mo", labelKey: "filters.date.3mo", label: "3 months", days: 91 },
  { key: "6mo", labelKey: "filters.date.6mo", label: "6 months", days: 182 },
  { key: "1yr", labelKey: "filters.date.1yr", label: "1 year", days: 365 },
  { key: "all", labelKey: "filters.date.all", label: "All time", days: null },
];

// Map pins are cached in localStorage, one entry per county, or per category of a county
// that loads by category (lib/mapCache.js). Change the version to force everyone to reload.
export const GEO_CACHE_VERSION = "lfs_geodata_v9"; // bumped: Jefferson is cached by category
// The cache is good until the next daily data load. The pipeline's loads start at 08:30,
// 08:45 and 09:15 UTC (.github/workflows); 11:00 leaves room for a late GitHub runner.
export const DATA_REFRESH_UTC_HOUR = 11;
