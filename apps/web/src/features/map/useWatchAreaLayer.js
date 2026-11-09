// Draws the signed-in user's watch areas as dashed circles under the pins. Clicking one
// opens its editor (watchAreaLayer.js): drag to move or resize, presets for the radius.
import { useEffect } from "react";
import maplibregl from "maplibre-gl";
import { buildWatchCollection, openWatchEditor } from "../../watchAreaLayer.js";
import { useLatest } from "../../hooks/useLatest.js";
import { CLICKABLE_LAYERS } from "./mapLayers.js";

const CIRCLE_COLOR = "#ff9f1c";

/**
 * @param {object} o
 * @param {React.RefObject} o.mapRef
 * @param {boolean} o.mapReady       true once the pin layers exist (circles go under them)
 * @param {object[]} o.watchAreas
 * @param {React.RefObject} o.pinnedSlot  the popup slot shared with the pin popups
 * @param {Function} o.onOpenPanel   (areaId) clicking the editor card opens the Saved panel
 * @param {Function} o.onCommit      (area, { center_lat, center_lon, radius_miles }) save an edit
 */
export function useWatchAreaLayer(o) {
  const { mapRef, mapReady, watchAreas, pinnedSlot } = o;
  const latest = useLatest(o);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      try {
        const data = buildWatchCollection(latest.current.watchAreas);
        const source = map.getSource("watch-areas");
        if (source) source.setData(data);
        else map.addSource("watch-areas", { type: "geojson", data });

        // The circles sit under the pins, so they need the pin layers to exist first.
        // Until then this returns, and the styledata listener below tries again.
        if (map.getLayer("watch-areas-fill") || !map.getLayer("points-null")) return;
        addCircleLayers(map);

        map.on("click", "watch-areas-fill", (e) => {
          // A tap on a pin (or its violation ring) is never also a tap on the circle under it.
          const pinLayers = CLICKABLE_LAYERS.filter((id) => map.getLayer(id));
          if (map.queryRenderedFeatures(e.point, { layers: pinLayers }).length) return;
          const id = e.features?.[0]?.properties?.id;
          const area = latest.current.watchAreas.find((a) => a.id === id);
          if (!area) return;
          openWatchEditor({
            maplibregl,
            map,
            popupRef: pinnedSlot,
            area,
            getAreas: () => latest.current.watchAreas,
            onOpenPanel: (areaId) => latest.current.onOpenPanel(areaId),
            onCommit: (patch) => latest.current.onCommit(area, patch),
          });
        });
        map.on("mouseenter", "watch-areas-fill", () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", "watch-areas-fill", () => (map.getCanvas().style.cursor = ""));
      } catch {
        // The style isn't ready yet; the styledata listener retries.
      }
    };

    apply();
    const retry = () => {
      if (!map.getLayer("watch-areas-fill")) apply();
    };
    map.on("styledata", retry);
    return () => map.off("styledata", retry);
  }, [watchAreas, mapReady, mapRef, pinnedSlot, latest]);
}

function addCircleLayers(map) {
  map.addLayer(
    {
      id: "watch-areas-fill",
      type: "fill",
      source: "watch-areas",
      paint: { "fill-color": CIRCLE_COLOR, "fill-opacity": 0.07 },
    },
    "points-null",
  );
  map.addLayer(
    {
      id: "watch-areas-line",
      type: "line",
      source: "watch-areas",
      paint: {
        "line-color": CIRCLE_COLOR,
        "line-width": 2,
        "line-opacity": 0.75,
        "line-dasharray": [2, 1.5],
      },
    },
    "points-null",
  );
}
