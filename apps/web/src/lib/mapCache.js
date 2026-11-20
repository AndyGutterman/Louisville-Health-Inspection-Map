// The map's pins, kept in the browser so a return visit costs the database nothing
// (features/map/useMapFeatures.js). One entry per county, so switching a county on never
// reloads another, and each is good until that county's data is loaded again: reading
// the database before then returns the same rows. Each entry keeps the county's load
// stamp it was saved under (data_loads, api/dataLoads.js), and is good while the stamp is
// the same: a load reaches visitors on their next visit, and a day without one costs them
// nothing. Comparing stamps, never the browser's clock with the server's, means a wrong
// clock can't make every visit look stale. Without a stamp on either side (the table isn't
// there yet, or its read failed) the old rule applies: good until the next daily refresh
// hour. localStorage, not sessionStorage: phones drop a tab's session storage whenever
// the tab is closed or put to sleep, so most visits were downloading every pin again.
// Pure apart from the storage passed in; any storage error just means "no cache".

const PREFIX = "lfs_geodata_"; // every version of the cache key starts with this
const DAY = 24 * 60 * 60 * 1000;
// Even with a matching stamp, an entry older than this is read again, in case a load
// ever fails to move the stamp.
export const MAX_STAMPED_AGE = 3 * DAY;

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
 * The cached features, or null when there are none, they're unreadable, or they're out of
 * date: saved under another load `stamp` than the current one (or more than
 * MAX_STAMPED_AGE ago), or, when either side has no stamp, saved before the latest daily
 * refresh (`refreshUtcHour`).
 * @param {string|null} [stamp]  the county's current load stamp, or null if unknown
 */
export function readMapCache(storage, { key, refreshUtcHour, stamp = null, now = Date.now() }) {
  try {
    const cached = JSON.parse(storage.getItem(key));
    const ts = cached?.ts;
    if (!(ts <= now) || !Array.isArray(cached.data?.features)) return null;
    const fresh =
      stamp && cached.stamp
        ? cached.stamp === stamp && now - ts < MAX_STAMPED_AGE
        : ts >= lastDataRefresh(now, refreshUtcHour);
    if (fresh) return cached.data.features;
  } catch {
    /* no storage, or not JSON: fetch instead */
  }
  return null;
}

/**
 * Saves the features under `key`, with the load `stamp` they were read under (null if
 * unknown), first removing older versions of the cache (a version
 * bump would otherwise leave them filling the ~5 MB the browser allows). Entries of the
 * same `version` (the other counties') are kept. False if it couldn't be saved (storage
 * full or blocked): the next visit simply loads from the database.
 */
export function writeMapCache(
  storage,
  features,
  { key, version = key, stamp = null, now = Date.now() },
) {
  try {
    for (let i = storage.length - 1; i >= 0; i--) {
      const k = storage.key(i);
      if (k?.startsWith(PREFIX) && k !== version && !k.startsWith(`${version}:`)) {
        storage.removeItem(k);
      }
    }
    const data = { type: "FeatureCollection", features };
    storage.setItem(key, JSON.stringify({ data, ts: now, stamp }));
    return true;
  } catch {
    return false;
  }
}
