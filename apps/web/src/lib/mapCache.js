// The map's pins, kept in the browser for GEO_CACHE_TTL (lib/constants.js) so a return
// visit within that time costs the database nothing (features/map/useMapFeatures.js).
// localStorage, not sessionStorage: phones drop a tab's session storage whenever the tab
// is closed or put to sleep, so most visits were downloading every pin (~2.4 MB) again.
// Pure apart from the storage passed in; any storage error just means "no cache".

const PREFIX = "lfs_geodata_"; // every version of GEO_CACHE_KEY starts with this

/** The cached features, or null when there are none, they're too old, or unreadable. */
export function readMapCache(storage, { key, ttl, now = Date.now() }) {
  try {
    const cached = JSON.parse(storage.getItem(key));
    const age = now - cached?.ts;
    if (age >= 0 && age < ttl && Array.isArray(cached.data?.features)) {
      return cached.data.features;
    }
  } catch {
    /* no storage, or not JSON: fetch instead */
  }
  return null;
}

/**
 * Saves the features under `key`, first removing older versions of the cache (a key bump
 * would otherwise leave them filling the ~5 MB the browser allows). False if it couldn't
 * be saved (storage full or blocked): the next visit simply loads from the database.
 */
export function writeMapCache(storage, features, { key, now = Date.now() }) {
  try {
    for (let i = storage.length - 1; i >= 0; i--) {
      const k = storage.key(i);
      if (k?.startsWith(PREFIX) && k !== key) storage.removeItem(k);
    }
    const data = { type: "FeatureCollection", features };
    storage.setItem(key, JSON.stringify({ data, ts: now }));
    return true;
  } catch {
    return false;
  }
}
