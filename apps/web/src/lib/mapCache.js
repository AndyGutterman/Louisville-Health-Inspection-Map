// The map's pins, kept in the browser so a return visit costs the database nothing
// (features/map/useMapFeatures.js). One entry per county, so switching a county on never
// reloads another, and each is good until the next daily data load: the pipeline loads
// every county once a day, so reading the database again before then returns the same
// rows. localStorage, not sessionStorage: phones drop a tab's session storage whenever
// the tab is closed or put to sleep, so most visits were downloading every pin again.
// Pure apart from the storage passed in; any storage error just means "no cache".

const PREFIX = "lfs_geodata_"; // every version of the cache key starts with this
const DAY = 24 * 60 * 60 * 1000;

/** The storage key for one county's pins: "<version>:<county>". */
export const countyCacheKey = (version, regionId) => `${version}:${regionId}`;

/**
 * The time (ms) of the latest daily data load at or before `now`: `utcHour`:00 UTC today,
 * or yesterday if that hasn't come yet.
 */
export function lastDataRefresh(now, utcHour) {
  const d = new Date(now);
  const today = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), utcHour);
  return today <= now ? today : today - DAY;
}

/**
 * The cached features, or null when there are none, they were saved before the latest
 * daily data load (`refreshUtcHour`), or they're unreadable.
 */
export function readMapCache(storage, { key, refreshUtcHour, now = Date.now() }) {
  try {
    const cached = JSON.parse(storage.getItem(key));
    const ts = cached?.ts;
    const fresh = ts <= now && ts >= lastDataRefresh(now, refreshUtcHour);
    if (fresh && Array.isArray(cached.data?.features)) return cached.data.features;
  } catch {
    /* no storage, or not JSON: fetch instead */
  }
  return null;
}

/**
 * Saves the features under `key`, first removing older versions of the cache (a version
 * bump would otherwise leave them filling the ~5 MB the browser allows). Entries of the
 * same `version` (the other counties') are kept. False if it couldn't be saved (storage
 * full or blocked): the next visit simply loads from the database.
 */
export function writeMapCache(storage, features, { key, version = key, now = Date.now() }) {
  try {
    for (let i = storage.length - 1; i >= 0; i--) {
      const k = storage.key(i);
      if (k?.startsWith(PREFIX) && k !== version && !k.startsWith(`${version}:`)) {
        storage.removeItem(k);
      }
    }
    const data = { type: "FeatureCollection", features };
    storage.setItem(key, JSON.stringify({ data, ts: now }));
    return true;
  } catch {
    return false;
  }
}
