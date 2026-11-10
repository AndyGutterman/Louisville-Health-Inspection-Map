// Loads every establishment as a map pin. Every county's pins share one list and are on the
// map together. Louisville's load at once; other counties' (Bullitt) only when loadRegion
// asks, which Map.jsx does once the map shows the county or a search needs it. Each county
// has a session cache, so a reload within a few hours doesn't ask the database again.
//   geoData     the GeoJSON the map draws: one pin per location (lib/dedupe.js)
//   getFeature  establishment id -> its feature, over the FULL list, including places
//               that share a pin with another place
//   coordIndex  location key -> every feature at that spot (for the "1 of 3" popup)
//   loadRegion  (regionId) load a county's pins; later calls do nothing
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchFacilityMeta, fetchMapFeed, fetchViolationFlags } from "../../api/mapData.js";
import { fetchBullittFeed } from "../../api/bullitt.js";
import { buildMapFeatures, combineRegions } from "../../lib/mapFeatures.js";
import { BULLITT, buildBullittFeatures } from "../../lib/bullitt.js";
import { buildCoordIndex, deduplicateForRender } from "../../lib/dedupe.js";
import { BULLITT_CACHE_KEY, GEO_CACHE_KEY, GEO_CACHE_TTL } from "../../lib/constants.js";
import { parseSimilarNearby } from "../../lib/inspectionHistory.js";

function readCache(key) {
  if (new URLSearchParams(window.location.search).has("bust")) return null; // dev escape hatch
  try {
    const cached = JSON.parse(sessionStorage.getItem(key));
    if (cached?.ts && Date.now() - cached.ts < GEO_CACHE_TTL && cached.data) {
      return cached.data.features;
    }
  } catch {
    /* unreadable cache: fetch instead */
  }
  return null;
}

function writeCache(key, features) {
  try {
    const data = { type: "FeatureCollection", features };
    sessionStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    /* storage full: skip the cache */
  }
}

async function loadLouisville() {
  const rows = await fetchMapFeed();
  if (!rows) return null;
  const flagsPromise = fetchViolationFlags(); // loads while the facility details do
  const meta = await fetchFacilityMeta();
  const features = buildMapFeatures(rows, meta, await flagsPromise);
  writeCache(GEO_CACHE_KEY, features);
  return features;
}

// Counties loaded on demand: region id -> { cacheKey, load() -> features or null }.
const ON_DEMAND = {
  [BULLITT]: {
    cacheKey: BULLITT_CACHE_KEY,
    load: async () => {
      const rows = await fetchBullittFeed();
      return rows ? buildBullittFeatures(rows) : null; // null: unavailable, not cached
    },
  },
};

export function useMapFeatures() {
  const [geoData, setGeoData] = useState(null);
  const byEid = useRef({});
  const coordIndex = useRef(new Map());
  const louisville = useRef(null); // a promise of Louisville's features
  const onDemand = useRef({}); // region id -> its features, once loaded
  const requested = useRef(new Set()); // one request per county per page load

  // Redraws the map from Louisville's pins plus every county loaded so far. Louisville's
  // come first, so their feature ids don't change when another county arrives.
  const publish = useCallback((base) => {
    const features = combineRegions(base, ...Object.values(onDemand.current));
    byEid.current = Object.fromEntries(features.map((f) => [f.properties.establishment_id, f]));
    coordIndex.current = buildCoordIndex(features);
    setGeoData({ type: "FeatureCollection", features: deduplicateForRender(features) });
  }, []);

  useEffect(() => {
    louisville.current = (async () => readCache(GEO_CACHE_KEY) ?? (await loadLouisville()))();
    louisville.current.then((base) => base && publish(base));
  }, [publish]);

  const loadRegion = useCallback(
    async (regionId) => {
      const spec = ON_DEMAND[regionId];
      if (!spec || requested.current.has(regionId)) return;
      requested.current.add(regionId);
      let features = readCache(spec.cacheKey);
      if (!features) {
        features = await spec.load();
        if (!features) return; // unavailable: Louisville carries on alone
        writeCache(spec.cacheKey, features);
      }
      const base = await louisville.current;
      if (!base) return;
      onDemand.current[regionId] = features;
      publish(base);
    },
    [publish],
  );

  const getFeature = useCallback((eid) => byEid.current[eid], []);

  // Other permits at the same physical place (saving a place saves these too).
  const similarEids = useCallback(
    (eid) =>
      parseSimilarNearby(byEid.current[eid]?.properties?.similar_nearby)
        .map((n) => n.eid)
        .filter(Boolean),
    [],
  );

  return { geoData, getFeature, similarEids, coordIndex, loadRegion };
}
