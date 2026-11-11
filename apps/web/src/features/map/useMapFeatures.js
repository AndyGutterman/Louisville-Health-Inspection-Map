// Loads every establishment as a map pin, from a session cache when it's fresh. Every
// county's pins share one list and show together. The four reads run side by side, pins
// appear as pages arrive, and the finished list is cached for the session
// (lib/constants.js GEO_CACHE_TTL), so a visitor costs the database one load per session.
//   geoData     the GeoJSON the map draws: one pin per location (lib/dedupe.js); grows
//               while loading
//   status      { loading, failed, places, jeffersonRows } for the loading indicator
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

// How often, at most, the pins are redrawn while data is still arriving.
const REDRAW_MS = 250;

/**
 * Reads the four sources side by side and calls show(features) as they come in: first
 * with whatever has arrived (each page of the Louisville feed, Bullitt, then the facility
 * types and violation rings that refine Louisville's pins), finally with everything.
 * Resolves to { features, jeffersonRows, ok }; ok is false if the Louisville feed failed
 * part-way (whatever loaded stays on the map).
 */
async function loadFeatures(show) {
  const parts = { rows: [], meta: new Map(), flags: new Map(), bullitt: [] };
  const build = () =>
    combineRegions(
      buildMapFeatures(parts.rows, parts.meta, parts.flags),
      buildBullittFeatures(parts.bullitt),
    );
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
    fetchBullittFeed().then((b) => ((parts.bullitt = b), soon())), // [] without Bullitt data
  ]);
  clearTimeout(timer);
  const features = build();
  if (rows) writeCache(features);
  return { features, jeffersonRows: parts.rows.length, ok: !!rows };
}

/** While pins are loading: { loading, failed, places } (places drawn so far). */
const START = { loading: true, failed: false, places: 0, jeffersonRows: 0 };

export function useMapFeatures() {
  const [geoData, setGeoData] = useState(null);
  const [status, setStatus] = useState(START);
  const byEid = useRef({});
  const coordIndex = useRef(new Map());

  useEffect(() => {
    let live = true;
    const show = (features, jeffersonRows) => {
      if (!live) return;
      byEid.current = Object.fromEntries(features.map((f) => [f.properties.establishment_id, f]));
      coordIndex.current = buildCoordIndex(features);
      setGeoData({ type: "FeatureCollection", features: deduplicateForRender(features) });
      setStatus((s) => ({ ...s, places: features.length, jeffersonRows }));
    };
    const cached = readCache();
    if (cached) {
      show(cached, cached.length);
      setStatus({ loading: false, failed: false, places: cached.length, jeffersonRows: 1 });
      return;
    }
    loadFeatures(show).then(({ features, jeffersonRows, ok }) => {
      if (!live) return;
      show(features, jeffersonRows);
      setStatus({ loading: false, failed: !ok, places: features.length, jeffersonRows });
    });
    return () => {
      live = false;
    };
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

  return { geoData, status, getFeature, similarEids, coordIndex };
}
