// Loads establishments as map pins, a piece at a time, and only the pieces asked for:
//   - the counties that are switched on (lib/counties.js): Jefferson on a first visit,
//     the others when they are tapped on the map or checked in the Filter tab;
//   - in a county whose data has facility types (Jefferson), the categories that are
//     switched on (lib/categories.js): Restaurants, Retail and Kitchens on a first visit,
//     the others when their tile is first tapped. The categories missing are asked for
//     in one read.
// Each piece is read from the browser's cache when that is fresh (lib/mapCache.js: good
// until the next daily data load), and from the database at most once per page
// otherwise. Switching a county or a category off only hides its pins; switching it back
// on shows them again without another read.
//   geoData     the GeoJSON the map draws: one pin per location (lib/dedupe.js), for the
//               counties switched on; grows while loading
//   status      { loading, failed, places, rowsSoFar, counties } for the loading
//               indicator and the county switches; counties is id -> { state, places }
//   getFeature  establishment id -> its feature, over every place loaded in the counties
//               switched on, including places that share a pin with another place
//   loadPins    reads the pins of a few places whose category isn't loaded (a saved
//               place, a row opened from a list): one small read, once per place
//   coordIndex  location key -> every feature at that spot (for the "1 of 3" popup)
//   retryFailed loads again the pieces that failed, and nothing else
import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchFacilityMeta,
  fetchMapFeed,
  fetchMapPins,
  fetchPinsById,
  fetchViolationFlags,
} from "../../api/mapData.js";
import { fetchBullittFeed } from "../../api/bullitt.js";
import { fetchPortalFeed } from "../../api/portal.js";
import { buildMapFeatures, buildPinFeatures, combineRegions } from "../../lib/mapFeatures.js";
import { BULLITT, buildBullittFeatures } from "../../lib/bullitt.js";
import { buildPortalFeatures } from "../../lib/portal.js";
import { enabledRegions, regionById, regionOfId } from "../../lib/regions.js";
import { CATEGORY_KEYS, categoryOrFilter } from "../../lib/categories.js";
import { tagSimilarNearby } from "../../lib/samePlaceDetection.js";
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

function readCache(pieceId) {
  if (new URLSearchParams(window.location.search).has("bust")) return null; // dev escape hatch
  return readMapCache(browserStorage(), {
    key: countyCacheKey(GEO_CACHE_VERSION, pieceId),
    refreshUtcHour: DATA_REFRESH_UTC_HOUR,
  });
}

const saveCache = (pieceId, features) =>
  writeMapCache(browserStorage(), features, {
    key: countyCacheKey(GEO_CACHE_VERSION, pieceId),
    version: GEO_CACHE_VERSION,
  });

// How often, at most, the pins are redrawn while data is still arriving.
const REDRAW_MS = 250;

/**
 * Louisville Metro on a database without v_facility_map_pins (migration 20261122000000):
 * the whole county in three reads side by side. show(features) runs as they come in: each page of the feed, then the facility types and violation rings that refine the
 * pins. Resolves to { features, ok, complete }: ok is false if the feed failed part-way
 * (whatever loaded stays on the map); complete is false if the types or rings failed
 * (their reads come back empty), so the result isn't cached and the next visit tries
 * again instead of showing plain pins until the next data load.
 */
async function loadJeffersonParts(show) {
  const parts = { rows: [], meta: new Map(), flags: new Map() };
  const build = () => buildMapFeatures(parts.rows, parts.meta, parts.flags);
  let timer = null;
  const soon = () => {
    timer ??= setTimeout(() => {
      timer = null;
      show(build());
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

/** Reads a whole county from the database (see loadJeffersonParts for what it resolves to). */
async function loadCounty(region, show) {
  if (region.id === BULLITT) return single(await fetchBullittFeed(), buildBullittFeatures);
  if (region.feed === "portal") {
    return single(await fetchPortalFeed([region.id]), buildPortalFeatures);
  }
  return loadJeffersonParts(show);
}

// A piece of the store: a whole county ("bullitt"), or one category of a county that
// loads by category ("jefferson/schools"). Also its key in the browser's cache.
const pieceId = (regionId, category) => (category ? `${regionId}/${category}` : regionId);
const eidOf = (f) => f.properties.establishment_id;

const START = { loading: true, failed: false, places: 0, rowsSoFar: 0, counties: {} };

/**
 * @param {string[]} shown  ids of the counties switched on (lib/counties.js)
 * @param {string[]} [categories]  keys of the categories switched on (lib/categories.js)
 */
export function useMapFeatures(shown, categories = CATEGORY_KEYS) {
  const [geoData, setGeoData] = useState(null);
  const [status, setStatus] = useState(START);
  // piece id -> { region, state: "loading" | "ready" | "failed", features }. A piece
  // stays here once read, switched on or not, so it is never read twice.
  const store = useRef({});
  // Counties with facility types that are read whole all the same: the database has no
  // v_facility_map_pins to filter by category.
  const whole = useRef(new Set());
  const cacheChecked = useRef(new Set());
  // County id -> features read one place at a time (loadPins); establishment id -> that read.
  const extras = useRef({});
  const pinReads = useRef({});
  const shownRef = useRef(shown);
  const categoriesRef = useRef(categories);
  const byEid = useRef({});
  const coordIndex = useRef(new Map());

  const byCategory = useCallback(
    (region) => region.has.categories && !whole.current.has(region.id),
    [],
  );

  // Everything loaded for one county. A county loaded by category is put together from
  // its categories and the places read singly, and only then tagged with similar places
  // nearby: a school's kitchen and its daycare are in different categories.
  const featuresOf = useCallback(
    (region) => {
      if (!byCategory(region)) return store.current[region.id]?.features ?? [];
      const all = CATEGORY_KEYS.flatMap(
        (c) => store.current[pieceId(region.id, c)]?.features ?? [],
      );
      const have = new Set(all.map(eidOf));
      for (const f of extras.current[region.id] ?? []) if (!have.has(eidOf(f))) all.push(f);
      return tagSimilarNearby(all);
    },
    [byCategory],
  );

  // Redraws the map from the counties switched on, and reports where each one stands.
  const publish = useCallback(() => {
    const on = shownRef.current;
    const pieces = Object.values(store.current);
    const counties = {};
    const lists = [];
    let active = [];
    for (const r of enabledRegions()) {
      const mine = pieces.filter((p) => p.region === r.id);
      // A county loaded by category can be on the map with nothing asked for yet.
      if (!mine.length && !(byCategory(r) && on.includes(r.id))) continue;
      const features = featuresOf(r);
      counties[r.id] = {
        state: mine.some((p) => p.state === "loading")
          ? "loading"
          : mine.some((p) => p.state === "failed")
            ? "failed"
            : "ready",
        places: features.length,
      };
      if (!on.includes(r.id)) continue;
      lists.push(features);
      active = active.concat(mine);
    }
    const features = combineRegions(...lists);
    byEid.current = Object.fromEntries(features.map((f) => [eidOf(f), f]));
    coordIndex.current = buildCoordIndex(features);
    setGeoData({ type: "FeatureCollection", features: deduplicateForRender(features) });
    setStatus({
      loading: active.some((p) => p.state === "loading"),
      failed: active.some((p) => p.state === "failed"),
      places: features.length,
      rowsSoFar: active.reduce((n, p) => n + p.features.length, 0),
      counties,
    });
  }, [byCategory, featuresOf]);

  // Starts a whole county, from the cache if it's fresh.
  const startWhole = useCallback(
    (region) => {
      const id = region.id;
      if (store.current[id]) return;
      const cached = readCache(id);
      if (cached) {
        store.current[id] = { region: id, state: "ready", features: cached };
        return;
      }
      const piece = { region: id, state: "loading", features: [] };
      store.current[id] = piece;
      const show = (features) => {
        piece.features = features;
        publish();
      };
      loadCounty(region, show).then(({ features, ok, complete }) => {
        piece.features = features;
        piece.state = ok ? "ready" : "failed";
        if (complete) saveCache(id, features);
        publish();
      });
    },
    [publish],
  );

  // Reads the given categories of a county in one request (v_facility_map_pins, filtered
  // by facility type), showing pages as they arrive. Each category is cached on its own,
  // so a later visit with other categories on reads only what it lacks.
  const loadCategories = useCallback(
    async (region, wanted) => {
      const mine = wanted.map((c) => [c, store.current[pieceId(region.id, c)]]);
      // Sorted into their categories here too, so a place can't land in two pieces.
      const sort = (rows) => {
        const features = buildPinFeatures(rows, { tag: false });
        for (const [c, piece] of mine) {
          piece.features = features.filter((f) => f.properties.cat === c);
        }
      };
      let timer = null;
      let seen = []; // the pages so far: they stay on the map if a later page fails
      const rows = await fetchMapPins((soFar) => {
        seen = soFar;
        timer ??= setTimeout(() => {
          timer = null;
          sort(seen);
          publish();
        }, REDRAW_MS);
      }, categoryOrFilter(wanted));
      clearTimeout(timer);

      if (rows === undefined) {
        // No such view on this database: read the county whole, the older way, once.
        for (const c of CATEGORY_KEYS) delete store.current[pieceId(region.id, c)];
        whole.current.add(region.id);
        startWhole(region);
        publish();
        return;
      }
      sort(rows ?? seen);
      for (const [c, piece] of mine) {
        piece.state = rows ? "ready" : "failed";
        if (rows) saveCache(pieceId(region.id, c), piece.features);
      }
      publish();
    },
    [publish, startWhole],
  );

  // Starts what a county still lacks. Does nothing for pieces already read or being
  // read: switching a county or a category off and on never asks the database again.
  const start = useCallback(
    (id) => {
      const region = regionById(id);
      if (region.has.categories && !cacheChecked.current.has(id)) {
        // A whole-county entry in the cache was saved by a visit that had to read it whole.
        cacheChecked.current.add(id);
        if (readCache(id)) whole.current.add(id);
      }
      if (!byCategory(region)) return startWhole(region);
      const missing = [];
      for (const c of categoriesRef.current) {
        const key = pieceId(id, c);
        if (store.current[key]) continue;
        const cached = readCache(key);
        store.current[key] = cached
          ? { region: id, state: "ready", features: cached }
          : { region: id, state: "loading", features: [] };
        if (!cached) missing.push(c);
      }
      if (missing.length) loadCategories(region, missing);
    },
    [byCategory, startWhole, loadCategories],
  );

  const shownKey = shown.join(",");
  const categoriesKey = categories.join(",");
  const drawnFor = useRef(null);
  useEffect(() => {
    shownRef.current = shown;
    categoriesRef.current = categories;
    const before = Object.keys(store.current).length;
    for (const id of shown) start(id);
    // A category switched on or off that needs no read changes nothing here: the map's
    // filter hides and shows its pins.
    const started = Object.keys(store.current).length !== before;
    if (started || drawnFor.current !== shownKey) publish();
    drawnFor.current = shownKey;
    // `shown` and `categories` are new arrays on every render: the keys say when their
    // contents change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey, categoriesKey, start, publish]);

  // Forgets the pieces that failed and reads them again; the rest are left alone.
  const retryFailed = useCallback(() => {
    for (const [id, p] of Object.entries(store.current)) {
      if (p.state === "failed") delete store.current[id];
    }
    for (const id of shownRef.current) start(id);
    publish();
  }, [start, publish]);

  const getFeature = useCallback((eid) => byEid.current[eid], []);

  // The pins of places that aren't loaded because their category isn't: a saved place,
  // or one opened from What's New, Table View or a link. One small read for those that
  // need it, and none for a place already loaded, already asked for, in a county that
  // is off or read whole, or in a county whose every category is loaded (then the place
  // simply has no pin). Resolves once they are on the map (getFeature finds them).
  const loadPins = useCallback(
    (eids) => {
      const lacking = (regionId) =>
        CATEGORY_KEYS.some((c) => store.current[pieceId(regionId, c)]?.state !== "ready");
      const ask = {};
      for (const eid of eids) {
        const region = regionOfId(eid);
        if (byEid.current[eid] || pinReads.current[eid]) continue;
        if (!byCategory(region) || !shownRef.current.includes(region.id)) continue;
        if (lacking(region.id)) (ask[region.id] ??= []).push(eid);
      }
      for (const [regionId, ids] of Object.entries(ask)) {
        const read = fetchPinsById(ids).then((rows) => {
          if (!rows) {
            for (const eid of ids) delete pinReads.current[eid]; // failed: ask again next time
            return;
          }
          (extras.current[regionId] ??= []).push(...buildPinFeatures(rows, { tag: false }));
          publish();
        });
        for (const eid of ids) pinReads.current[eid] = read;
      }
      return Promise.all(eids.map((eid) => pinReads.current[eid]));
    },
    [byCategory, publish],
  );

  // Other permits at the same physical place (saving a place saves these too).
  const similarEids = useCallback(
    (eid) =>
      parseSimilarNearby(byEid.current[eid]?.properties?.similar_nearby)
        .map((n) => n.eid)
        .filter(Boolean),
    [],
  );

  return { geoData, status, getFeature, loadPins, similarEids, coordIndex, retryFailed };
}
