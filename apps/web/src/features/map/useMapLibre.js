// Creates the MapLibre map at once (pins are added as they load), and owns what happens on it:
// the pin layers and their filters, hovering and clicking pins, closing the drawer on a
// click outside it, and nudging the map when the pointer rests at a screen edge.
import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl"; // its CSS is imported in Map.jsx, before Map.css
import { PIN_COLORS } from "../../Colors.jsx";
import { EDGE_ZONE, MIN_ZOOM } from "../../lib/constants.js";
import { METRO_BOUNDS, looseBounds } from "../../lib/mapBounds.js";
import { coordKey, worstFirst } from "../../lib/dedupe.js";
import { featureSearchKey, matchesSearch, searchTokens } from "../../lib/searchText.js";
import { useLatest } from "../../hooks/useLatest.js";
import { CLICKABLE_LAYERS, addPinLayers, applyFilters, pinLayersReady } from "./mapLayers.js";
import { pickPin, uniqueHits } from "../../lib/pinPicking.js";
import { createPopups } from "./popups.jsx";
import { addRegionOutlines } from "./regionOutlines.js";

const BASEMAP = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const NO_PINS = { type: "FeatureCollection", features: [] };

// Panels that work beside the drawer: a click inside one doesn't close it. Any new
// floating panel or toggle must be added here.
const KEEP_DRAWER_OPEN =
  ".wa-handle, .control-card, .info-drawer, .acct-panel, .header-nav-btn--account, .table-panel, .table-toggle-btn, .pins-loading";
// What's New also keeps the drawer open when a press only starts inside it (a resize).
const WHATS_NEW = ".wn-panel, .wn-trigger";
// The pointer resting near these doesn't auto-pan the map.
const NO_EDGE_PAN = [".control-card", ".app-header", ".info-drawer", ".table-panel", ".wb2"];

const isHoverDevice = () => !!window.matchMedia?.("(hover: hover)").matches;

/**
 * @param {object} o
 * @param {React.RefObject} o.containerRef  the element the map renders into
 * @param {object|null} o.geoData            pins to draw (useMapFeatures); redrawn as it grows
 * @param {Function} o.getFeature            establishment id -> feature
 * @param {React.RefObject<Map>} o.coordIndex  location key -> features at that spot
 * @param {object} o.filters                 filter panel state (lib/mapFilters.js)
 * @param {Set<string>} o.savedIds           saved places, for the popups' save buttons
 * @param {boolean} o.drawerOpen
 * @param {string} o.searchTerm
 * @param {Function} o.onToggleSaved         (eid) save or unsave
 * @param {Function} o.onOpenDrawer          (eid, props) open the info drawer
 * @param {Function} o.onBackgroundClick     a click on empty map or outside the panels
 */
export function useMapLibre(o) {
  const { containerRef, geoData, getFeature, coordIndex, filters, savedIds } = o;
  const mapRef = useRef(null);
  const pinnedSlot = useRef(null); // the pinned popup, shared with the watch-area editor
  const popupsRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const latest = useLatest(o);

  useEffect(() => {
    if (mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP,
      center: [-85.75, 38.25],
      zoom: MIN_ZOOM,
      // Room to pan pins out from under the drawer and side panels (lib/mapBounds.js).
      maxBounds: looseBounds(METRO_BOUNDS, {
        width: window.innerWidth,
        height: window.innerHeight,
        zoom: MIN_ZOOM,
      }),
    });
    mapRef.current = map;
    let dragging = false;
    let pressOnPin = false; // a press on a pin is the map's click, not an "outside" click
    let lastDownTarget = null;

    // The popup pointer takes the colour of the pin's score band.
    const colorForScore = (score) => {
      const [redMax, yellowMax] = latest.current.filters.pins;
      if (score == null) return PIN_COLORS.null;
      if (score === 0) return PIN_COLORS.zero;
      if (score <= redMax) return PIN_COLORS.red;
      if (score <= yellowMax) return PIN_COLORS.yellow;
      return PIN_COLORS.green;
    };

    // With the drawer already open, the place a click lands on replaces the one in it,
    // whether the pin stands alone or the popup is a "1 of 3" (and stepping through that
    // popup switches it too). Desktop only: on touch screens the popup is tapped to open
    // the drawer.
    const switchDrawerTo = (feature) => {
      if (latest.current.drawerOpen && isHoverDevice()) {
        latest.current.onOpenDrawer(feature.properties.establishment_id, feature.properties);
      }
    };

    const popups = createPopups({
      map,
      pinnedSlot,
      isSaved: (eid) => latest.current.savedIds.has(eid),
      onToggleSaved: (eid) => latest.current.onToggleSaved(eid),
      onOpenDrawer: (eid, props) => latest.current.onOpenDrawer(eid, props),
      onGroupShow: switchDrawerTo,
      colorForScore,
    });
    popupsRef.current = popups;

    const closeEverything = () => {
      popups.clearAll();
      latest.current.onBackgroundClick();
    };

    // ── Which pin a pointer means (lib/pinPicking.js) ────────────────────────────
    const screenDistance = (point, f) => {
      const p = map.project(f.geometry.coordinates);
      return Math.hypot(p.x - point.x, p.y - point.y);
    };
    // The pin under the pointer, and every pin drawn at the same screen spot.
    const pinsAt = (point) => {
      const raw = map.queryRenderedFeatures(
        [
          [point.x - 12, point.y - 12],
          [point.x + 12, point.y + 12],
        ],
        { layers: CLICKABLE_LAYERS },
      );
      const hits = uniqueHits(raw);
      const feature = pickPin(hits, (f) => screenDistance(point, f));
      if (!feature) return { feature: null, group: [] };
      const at = map.project(feature.geometry.coordinates);
      const group = hits.filter((h) => screenDistance(at, h) < 0.9);
      return { feature, group };
    };
    // Every place at a feature's location. Uses the stored feature's coordinates: rendered
    // features can differ in the last decimal places and miss the index.
    const placesAt = (f) =>
      coordIndex.current.get(
        coordKey((getFeature(f.properties.establishment_id) ?? f).geometry.coordinates),
      );
    // Every place the pointer reaches at a pin: those at exactly its spot (lib/dedupe.js
    // draws one pin for them) and those at the other pins under the same screen point.
    // Hover and click both count with this, so the "N locations here" badge never
    // appears only on the click.
    const placesUnder = (feature, group) => {
      const byEid = new Map();
      for (const g of group.length ? group : [feature]) {
        for (const f of placesAt(g) || [g]) {
          const eid = f.properties?.establishment_id;
          if (eid && !byEid.has(eid)) byEid.set(eid, f);
        }
      }
      return byEid.size ? [...byEid.values()] : [feature];
    };
    // In a "1 of 3" popup, start on the place matching the search, if any.
    const startIndex = (features) => {
      const term = latest.current.searchTerm;
      if (!searchTokens(term).length) return 0;
      const i = features.findIndex(({ properties: p }) => matchesSearch(featureSearchKey(p), term));
      return Math.max(i, 0);
    };

    // ── Pin events ───────────────────────────────────────────────────────────────
    const onPinClick = (e) => {
      popups.closeWatchEditor();
      popups.hideHover();
      const { feature, group } = pinsAt(e.point);
      if (!feature) return;

      const places = placesUnder(feature, group);
      if (places.length > 1) {
        const sorted = places.slice().sort(worstFirst);
        popups.showGroup(sorted, startIndex(sorted));
        return;
      }

      popups.showPinned(feature);
      switchDrawerTo(feature);
    };

    map.on("load", () => {
      addPinLayers(map, latest.current.geoData ?? NO_PINS, latest.current.filters.pins);
      addRegionOutlines(map);
      setMapReady(true);

      // One listener for all of them: a ringed pin is on three layers (pin, ring, tap
      // target), and a click must run once, not once per layer.
      const layers = CLICKABLE_LAYERS;
      map.on("mousemove", layers, (e) => {
        const { feature, group } = pinsAt(e.point);
        if (feature) popups.pointerOver(feature, placesUnder(feature, group).length);
      });
      map.on("mousedown", layers, () => (pressOnPin = true));
      map.on("click", layers, onPinClick);
      map.on("mouseenter", layers, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", layers, () => {
        popups.hideHover();
        map.getCanvas().style.cursor = "";
      });
      map.on("dragstart", () => (dragging = true));
      map.on("dragend", () => (dragging = false));

      // A click on empty map closes the drawer and the popups.
      map.on("click", (e) => {
        const onPin = map.queryRenderedFeatures(e.point, { layers: CLICKABLE_LAYERS }).length;
        if (!onPin && !popups.contains(e.originalEvent.target)) closeEverything();
      });

      document.addEventListener("pointerdown", rememberPress, true);
      document.addEventListener("click", closeOnOutsideClick, true);

      applyFilters(map, latest.current.filters);
    });

    // So a press that starts in What's New and ends elsewhere (a resize) doesn't count.
    function rememberPress(ev) {
      lastDownTarget = ev.target;
    }

    // A click anywhere outside the drawer and the panels that work beside it closes it.
    function closeOnOutsideClick(ev) {
      if (pressOnPin) {
        pressOnPin = false;
        return;
      }
      const downTarget = lastDownTarget;
      lastDownTarget = null;
      if (ev.target.closest?.(WHATS_NEW) || downTarget?.closest?.(WHATS_NEW)) return;
      if (dragging) return;
      if (popups.contains(ev.target)) return;
      if (ev.target.closest?.(KEEP_DRAWER_OPEN)) return;
      closeEverything();
    }

    return () => {
      document.removeEventListener("pointerdown", rememberPress, true);
      document.removeEventListener("click", closeOnOutsideClick, true);
      popups.clearAll();
      popupsRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [containerRef, getFeature, coordIndex, latest]);

  // Pins arrive in batches while the data loads (useMapFeatures): redraw the source.
  useEffect(() => {
    if (mapReady && geoData) mapRef.current?.getSource("facilities")?.setData(geoData);
  }, [geoData, mapReady]);

  // Re-apply the filters whenever the filter panel changes. When the map is busy the change
  // waits for it to go idle, and then applies the filters as they are at that moment: a
  // waiting copy of older filters once undid newer ones (pins snapped back to their old
  // colours after the score sliders moved).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    if (pinLayersReady(map)) {
      applyFilters(map, filters);
      return undefined;
    }
    const applyLatest = () => pinLayersReady(map) && applyFilters(map, latest.current.filters);
    map.once("idle", applyLatest);
    return () => map.off("idle", applyLatest);
  }, [filters, latest]);

  // Keep open popups' save buttons in step with the saved list (saving from the drawer,
  // for example).
  useEffect(() => {
    popupsRef.current?.syncSaveButtons();
  }, [savedIds]);

  useEdgePan(mapRef);

  // For panels outside the map: open or hover a place's popup, move the map.
  const api = useMemo(
    () => ({
      openPopup: (feature) => popupsRef.current?.openFor(feature),
      hoverPopup: (feature) => popupsRef.current?.hoverFor(feature),
      endHover: () => popupsRef.current?.hideHover(),
      showRowPopup: (feature) => popupsRef.current?.showRow(feature),
      easeTo: (options) => mapRef.current?.easeTo(options),
      fitBounds: (bounds, options) => mapRef.current?.fitBounds(bounds, options),
      closePopups: () => popupsRef.current?.clearAll(),
    }),
    [],
  );

  return { mapRef, mapReady, pinnedSlot, ...api };
}

// The pointer resting at a screen edge pans the map a step, once per visit to the edge,
// unless it's over a panel.
function useEdgePan(mapRef) {
  useEffect(() => {
    let atEdge = false;
    const overPanel = (x, y) =>
      NO_EDGE_PAN.some((sel) => {
        const r = document.querySelector(sel)?.getBoundingClientRect();
        return r && x >= r.left - 8 && x <= r.right + 8 && y >= r.top - 8 && y <= r.bottom + 8;
      });
    const onMove = (e) => {
      const dx = e.clientX <= EDGE_ZONE ? -1 : e.clientX >= window.innerWidth - EDGE_ZONE ? 1 : 0;
      const dy = e.clientY <= EDGE_ZONE ? -1 : e.clientY >= window.innerHeight - EDGE_ZONE ? 1 : 0;
      const active =
        (dx || dy) && mapRef.current && e.buttons === 0 && !overPanel(e.clientX, e.clientY);
      if (active && !atEdge) mapRef.current.panBy([dx * 60, dy * 60], { duration: 240 });
      atEdge = !!active;
    };
    const reset = () => (atEdge = false);
    document.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseleave", reset);
    window.addEventListener("blur", reset);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", reset);
      window.removeEventListener("blur", reset);
    };
  }, [mapRef]);
}
