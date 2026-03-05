/**
 * lib/utils.js for helpers shared across all seed scripts
 */

/** Normalise an establishment / inspection ID to a plain integer string, or null. */
export const normId = v => {
  if (v == null) return null;
  const n = parseInt(String(v).replace(/,/g, '').trim(), 10);
  return Number.isFinite(n) ? String(n) : null;
};

/** Upper-case, strip non-alphanumeric for search columns. */
export const normText = s =>
  s ? String(s).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim() : '';

/** ArcGIS epoch-ms -> 'YYYY-MM-DD', or null. */
export const toISODate = ms => (ms ? new Date(ms).toISOString().slice(0, 10) : null);

export const sleep = ms => new Promise(r => setTimeout(r, ms));
