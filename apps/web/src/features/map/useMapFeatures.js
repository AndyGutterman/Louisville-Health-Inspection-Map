// Loads every establishment as a map pin, from a session cache when it's fresh. Every
// county's pins share one list and show together. The four reads run side by side and
// the result is cached for the session (lib/constants.js GEO_CACHE_TTL), so a visitor
// costs the database one load per session.
//   geoData     the GeoJSON the map draws: one pin per location (lib/dedupe.js)
//   getFeature  establishment id -> its feature, over the FULL list, including places
//               that share a pin with another place
//   coordIndex  location key -> every feature at that spot (for the "1 of 3" popup)
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchFacilityMeta, fetchMapFeed, fetchViolationFlags } from "../../api/mapData.js";
import { fetchBullittFeed } from "../../api/bullitt.js";
import { buildMapFeatures, combineRegions } from "../../lib/mapFeatures.js";
import { buildBullittFeatures } from "../../lib/bullitt.js";
import { buildCoordIndex, deduplicateForRender } from "../../lib/dedupe.js";
import { GEO_CACHE_KEY, GEO_CACHE_TTL } from "../../lib/constants.js";
import { parseSimilarNearby } from "../../lib/inspectionHistory.js";

function readCache() {
  if (new URLSearchParams(window.location.search).has("bust")) return null; // dev escape hatch
  try {
    const cached = JSON.parse(sessionStorage.getItem(GEO_CACHE_KEY));
    if (cached?.ts && Date.now() - cached.ts < GEO_CACHE_TTL && cached.data) {
      return cached.data.features;
    }
  } catch {
    /* unreadable cache: fetch instead */
  }
  return null;
}

function writeCache(features) {
  try {
    const data = { type: "FeatureCollection", features };
    sessionStorage.setItem(GEO_CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    /* storage full: skip the cache */
  }
}

async function loadFeatures() {
  const [rows, meta, flags, bullitt] = await Promise.all([
    fetchMapFeed(),
    fetchFacilityMeta(),
    fetchViolationFlags(),
    fetchBullittFeed(), // [] when the database has no Bullitt data
  ]);
  if (!rows) return null;
  const features = combineRegions(
    buildMapFeatures(rows, meta, flags),
    buildBullittFeatures(bullitt),
  );
  writeCache(features);
  return features;
}

export function useMapFeatures() {
  const [geoData, setGeoData] = useState(null);
  const byEid = useRef({});
  const coordIndex = useRef(new Map());

  useEffect(() => {
    (async () => {
      const features = readCache() ?? (await loadFeatures());
      if (!features) return;
      byEid.current = Object.fromEntries(features.map((f) => [f.properties.establishment_id, f]));
      coordIndex.current = buildCoordIndex(features);
      setGeoData({ type: "FeatureCollection", features: deduplicateForRender(features) });
    })();
  }, []);

  const getFeature = useCallback((eid) => byEid.current[eid], []);

  // Other permits at the same physical place (saving a place saves these too).
  const similarEids = useCallback(
    (eid) =>
      parseSimilarNearby(byEid.current[eid]?.properties?.similar_nearby)
        .map((n) => n.eid)
        .filter(Boolean),
    [],
  );

  return { geoData, getFeature, similarEids, coordIndex };
}
