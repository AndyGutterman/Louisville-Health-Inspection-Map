// Which counties are switched on. Only Jefferson's pins load on a first visit; the others
// are shaded on the map until they're tapped, or checked in the Filter tab, so a visitor
// only costs the database the counties they look at. The choice is kept in the browser,
// so a county someone turned on is still on next time. Pure apart from the storage
// passed in; any storage error just means "the default".
import { DEFAULT_REGION, enabledRegions } from "./regions.js";

export const COUNTY_CHOICE_KEY = "lfs_counties";

const knownIds = (regions) => regions.map((r) => r.id);

// In the regions' own order, without unknown ids or repeats.
const tidy = (ids, regions) => knownIds(regions).filter((id) => ids.includes(id));

/** The counties shown on a first visit: Jefferson only. */
export const defaultCounties = (regions = enabledRegions()) => tidy([DEFAULT_REGION], regions);

/**
 * The saved choice, or the default when there is none, it's unreadable, or it names no
 * county the site still has.
 */
export function readCountyChoice(storage, regions = enabledRegions()) {
  try {
    const saved = JSON.parse(storage.getItem(COUNTY_CHOICE_KEY));
    if (Array.isArray(saved)) {
      const ids = tidy(saved, regions);
      if (ids.length) return ids;
    }
  } catch {
    /* no storage, or not JSON */
  }
  return defaultCounties(regions);
}

/** Saves the choice. False if it couldn't be saved (storage blocked or full). */
export function writeCountyChoice(storage, ids) {
  try {
    storage.setItem(COUNTY_CHOICE_KEY, JSON.stringify(ids));
    return true;
  } catch {
    return false;
  }
}

/** The choice with one county switched on or off. */
export function toggleCounty(ids, id, on, regions = enabledRegions()) {
  const next = on ? [...ids, id] : ids.filter((x) => x !== id);
  return tidy(next, regions);
}

/** The switched-on counties Table View can list (lib/regions.js has.table). */
export const tableCounties = (ids, regions = enabledRegions()) =>
  regions.filter((r) => r.has.table && ids.includes(r.id));

/**
 * What a county's row or map button says under its name.
 * @param {{ shown: boolean, state?: "loading"|"ready"|"failed", places?: number }} c
 */
export function countyStatusText({ shown, state, places }) {
  if (state === "loading") return "Loading…";
  if (state === "failed") return "Couldn't load. Tap to retry";
  if (state === "ready") {
    const n = `${(places ?? 0).toLocaleString("en-US")} place${places === 1 ? "" : "s"}`;
    return shown ? n : `${n}, hidden`;
  }
  return "Not loaded";
}
