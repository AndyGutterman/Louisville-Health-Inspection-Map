// The map's pin layers (one per score band), the violation rings drawn on top of them,
// and applying the filter panel's state to all of them.
import { PIN_COLORS } from "../../Colors.jsx";
import { DRAW_ORDER } from "../../lib/constants.js";
import { bandExprs } from "../../lib/scoring.js";
import { buildLayerFilters } from "../../lib/mapFilters.js";

// Layer ids of the score-band pins, bottom to top: points-null, points-green, ...
export const PIN_LAYERS = DRAW_ORDER.map((k) => `points-${k}`);

// Circle radius that grows with the zoom level. stops: [[zoom, radius], ...]
const radiusByZoom = (stops) => ["interpolate", ["linear"], ["zoom"], ...stops.flat()];

// Adds the "facilities" source, a circle layer per score band, and the two violation
// ring layers. pins: the red/yellow cut-offs the bands start with.
export function addPinLayers(map, geoData, pins) {
  const phone = window.innerWidth <= 600; // smaller pins on phones
  map.addSource("facilities", { type: "geojson", data: geoData });

  const pinRadius = radiusByZoom([
    [8, phone ? 4 : 6],
    [11, phone ? 8 : 10.5],
    [14, phone ? 12 : 14],
    [17, phone ? 16 : 18],
  ]);
  const bands = bandExprs(pins);
  for (const key of DRAW_ORDER) {
    map.addLayer({
      id: `points-${key}`,
      type: "circle",
      source: "facilities",
      paint: {
        "circle-radius": pinRadius,
        "circle-opacity": 0.9,
        "circle-stroke-width": 2,
        "circle-stroke-color": "rgba(0,0,0,0.4)",
        "circle-blur": 0.25,
        "circle-color": PIN_COLORS[key] ?? PIN_COLORS.green,
      },
      filter: bands[key],
    });
  }

  // Violation rings sit above the pins. Blue (non-critical only) goes first, so the red
  // critical ring wins where both could apply.
  const ringRadius = radiusByZoom([
    [8, phone ? 5.5 : 7.5],
    [11, phone ? 9.5 : 12],
    [14, phone ? 13.5 : 15.5],
    [17, phone ? 17.5 : 19.5],
  ]);
  const ring = (id, filter, strokeWidth, strokeColor) =>
    map.addLayer({
      id,
      type: "circle",
      source: "facilities",
      filter,
      paint: {
        "circle-radius": ringRadius,
        "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-width": strokeWidth,
        "circle-stroke-color": strokeColor,
      },
    });
  ring(
    "points-noncritical-ring",
    [
      "all",
      ["==", ["get", "has_any_violation"], true],
      ["==", ["get", "has_critical_violation"], false],
    ],
    2,
    "rgba(58,134,255,0.80)",
  );
  ring(
    "points-critical-ring",
    ["==", ["get", "has_critical_violation"], true],
    2.5,
    "rgba(234,67,53,0.90)", // the red pin colour
  );
}

// True once the style and every pin layer exist, which is when filters can be set.
export function pinLayersReady(map) {
  return map.isStyleLoaded() && PIN_LAYERS.every((id) => map.getLayer(id));
}

// Applies the filter panel's state (see buildLayerFilters) to every pin and ring layer.
export function applyFilters(map, filters) {
  for (const [id, expr] of Object.entries(buildLayerFilters(filters))) {
    if (map.getLayer(id)) map.setFilter(id, expr);
  }
}
