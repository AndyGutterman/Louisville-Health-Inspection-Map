// Loads establishments as map pins, one county at a time, and only the counties that are
// switched on (lib/counties.js): Jefferson on a first visit, the others when they are
// tapped on the map or checked in the Filter tab. Each county is read from the browser's
// cache when that is fresh (lib/mapCache.js: good until the next daily data load), and
// from the database at most once per page otherwise. Switching a county off only hides
// its pins; switching it back on shows them again without another read.
//   geoData     the GeoJSON the map draws: one pin per location (lib/dedupe.js), for the
//               counties switched on; grows while loading
//   status      { loading, failed, places, rowsSoFar, counties } for the loading
//               indicator and the county switches; counties is id -> { state, places }
//   getFeature  establishment id -> its feature, over every place in the counties
//               switched on, including places that share a pin with another place
//   coordIndex  location key -> every feature at that spot (for the "1 of 3" popup)
//   retryFailed loads again the counties that failed, and nothing else
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchFacilityMeta, fetchMapFeed, fetchViolationFlags } from "../../api/mapData.js";
import { fetchBullittFeed } from "../../api/bullitt.js";
import { fetchPortalFeed } from "../../api/portal.js";
import { buildMapFeatures, combineRegions } from "../../lib/mapFeatures.js";
import { BULLITT, buildBullittFeatures } from "../../lib/bullitt.js";
import { buildPortalFeatures } from "../../lib/portal.js";
import { enabledRegions, regionById } from "../../lib/regions.js";
import { buildCoordIndex, deduplicateForRender } from "../../lib/dedupe.js";
import { DATA_REFRESH_UTC_HOUR, GEO_CACHE_VERSION } from "../../lib/constants.js";
import { parseSimilarNearby } from "../../lib/inspectionHistory.js";
import { countyCacheKey, readMapCache, writeMapCache } from "../../lib/mapCache.js";

// window.localStorage itself can throw (blocked site data), so ask for it carefully.
function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readCache(regionId) {
  if (new URLSearchParams(window.location.search).has("bust")) return null; // dev escape hatch
  return readMapCache(browserStorage(), {
    key: countyCacheKey(GEO_CACHE_VERSION, regionId),
    refreshUtcHour: DATA_REFRESH_UTC_HOUR,
  });
}

const saveCache = (regionId, features) =>
  writeMapCache(browserStorage(), features, {
    key: countyCacheKey(GEO_CACHE_VERSION, regionId),
    version: GEO_CACHE_VERSION,
  });

// How often, at most, the pins are redrawn while data is still arriving.
const REDRAW_MS = 250;

/**
 * Louisville Metro: three reads side by side. show(features, rowsSoFar) runs as they come
 * in: each page of the feed, then the facility types and violation rings that refine the
 * pins. Resolves to { features, ok, complete }: ok is false if the feed failed part-way
 * (whatever loaded stays on the map); complete is false if the types or rings failed
 * (their reads come back empty), so the result isn't cached and the next visit tries
 * again instead of showing plain pins until the next data load.
 */
async function loadJefferson(show) {
  const parts = { rows: [], meta: new Map(), flags: new Map() };
  const build = () => buildMapFeatures(parts.rows, parts.meta, parts.flags);
  let timer = null;
  const soon = () => {
    timer ??= setTimeout(() => {
      timer = null;
      show(build(), parts.rows.length);
    }, REDRAW_MS);
  };
  const [rows] = await Promise.all([
    fetchMapFeed((soFar) => {
      parts.rows = soFar;
      soon();
    }).then((all) => {
      if (all) parts.rows = all;
      soon();
      return all;
    }),
    fetchFacilityMeta().then((m) => ((parts.meta = m), soon())),
    fetchViolationFlags().then((f) => ((parts.flags = f), soon())),
  ]);
  clearTimeout(timer);
  return {
    features: build(),
    ok: !!rows,
    complete: !!rows && parts.meta.size > 0 && parts.flags.size > 0,
  };
}

// A county with one read: null rows mean the read failed.
const single = (rows, build) => ({
  features: build(rows ?? []),
  ok: rows != null,
  complete: rows != null,
});

/** Reads one county from the database (see loadJefferson for what it resolves to). */
async function loadCounty(region, show) {
  if (region.id === BULLITT) return single(await fetchBullittFeed(), buildBullittFeatures);
  if (region.feed === "portal") {
    return single(await fetchPortalFeed([region.id]), buildPortalFeatures);
  }
  return loadJefferson(show);
}

const START = { loading: true, failed: false, places: 0, rowsSoFar: 0, counties: {} };

/**
 * @param {string[]} shown  ids of the counties switched on (lib/counties.js)
 */
export function useMapFeatures(shown) {
  const [geoData, setGeoData] = useState(null);
  const [status, setStatus] = useState(START);
  // id -> { state: "loading" | "ready" | "failed", features, rows }. A county stays here
  // once read, switched on or not, so it is never read twice.
  const store = useRef({});
  const shownRef = useRef(shown);
  const byEid = useRef({});
  const coordIndex = useRef(new Map());

  // Redraws the map from the counties switched on, and reports where each one stands.
  const publish = useCallback(() => {
    const on = shownRef.current;
    const lists = enabledRegions()
      .filter((r) => on.includes(r.id))
      .map((r) => store.current[r.id]?.features ?? []);
    const features = combineRegions(...lists);
    byEid.current = Object.fromEntries(features.map((f) => [f.properties.establishment_id, f]));
    coordIndex.current = buildCoordIndex(features);
    setGeoData({ type: "FeatureCollection", features: deduplicateForRender(features) });

    const entries = Object.entries(store.current);
    const active = entries.filter(([id]) => on.includes(id)).map(([, c]) => c);
    setStatus({
      loading: active.some((c) => c.state === "loading"),
      failed: active.some((c) => c.state === "failed"),
      places: features.length,
      rowsSoFar: active.reduce((n, c) => n + c.rows, 0),
      counties: Object.fromEntries(
        entries.map(([id, c]) => [id, { state: c.state, places: c.features.length }]),
      ),
    });
  }, []);

  // Starts one county, from the cache if it's fresh. Does nothing for a county already
  // read or being read: unchecking and rechecking a county never asks the database again.
  const start = useCallback(
    (id) => {
      if (store.current[id]) return;
      const cached = readCache(id);
      if (cached) {
        store.current[id] = { state: "ready", features: cached, rows: cached.length };
        return;
      }
      const entry = { state: "loading", features: [], rows: 0 };
      store.current[id] = entry;
      const show = (features, rows) => {
        entry.features = features;
        entry.rows = rows;
        publish();
      };
      loadCounty(regionById(id), show).then(({ features, ok, complete }) => {
        entry.features = features;
        entry.rows = features.length;
        entry.state = ok ? "ready" : "failed";
        if (complete) saveCache(id, features);
        publish();
      });
    },
    [publish],
  );

  const shownKey = shown.join(",");
  useEffect(() => {
    shownRef.current = shown;
    for (const id of shown) start(id);
    publish();
    // `shown` is a new array on every render: shownKey says when its contents change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey, start, publish]);

  // Forgets the counties that failed and reads them again; the rest are left alone.
  const retryFailed = useCallback(() => {
    for (const [id, c] of Object.entries(store.current)) {
      if (c.state === "failed") delete store.current[id];
    }
    for (const id of shownRef.current) start(id);
    publish();
  }, [start, publish]);

  const getFeature = useCallback((eid) => byEid.current[eid], []);

  // Other permits at the same physical place (saving a place saves these too).
  const similarEids = useCallback(
    (eid) =>
      parseSimilarNearby(byEid.current[eid]?.properties?.similar_nearby)
        .map((n) => n.eid)
        .filter(Boolean),
    [],
  );

  return { geoData, status, getFeature, similarEids, coordIndex, retryFailed };
}
