// The map's pin layers (one per score band), the violation rings drawn on top of them,
// and applying the filter panel's state to all of them.
import { PIN_COLORS } from "../../Colors.jsx";
import { DRAW_ORDER } from "../../lib/constants.js";
import { bandExprs } from "../../lib/scoring.js";
import { buildLayerFilters } from "../../lib/mapFilters.js";
import { HIT_LAYER, RING_LAYER } from "../../lib/pinPicking.js";
import { formItemRegionIds } from "../../lib/regions.js";

// Layer ids of the score-band pins, bottom to top: points-null, points-green, ...
export const PIN_LAYERS = DRAW_ORDER.map((k) => `points-${k}`);

// Layers a tap or hover can land on: the pins, plus the violation ring and the invisible,
// wider tap target around ringed places, so those are easier to hit.
export const CLICKABLE_LAYERS = [...PIN_LAYERS, RING_LAYER, HIT_LAYER];

// How far past the ring the tap target reaches, in pixels.
const HIT_PADDING = 8;

// Amber: stands out from the red, yellow and green pins.
export const RING_COLOR = "rgba(249,115,22,0.90)";
// Bullitt County's sheet lists every inspection-form item marked at a visit, so its rings are
// far more common than Louisville's and mean less (docs/BULLITT.md). A cooler colour keeps
// the two from being read on the same scale.
export const BULLITT_RING_COLOR = "rgba(125,211,252,0.85)";
// Oldham's portal data lists form items the same way, so it gets the same rings.
const isFormItemRegion = ["in", ["get", "region"], ["literal", formItemRegionIds()]];
const ringColor = ["case", isFormItemRegion, BULLITT_RING_COLOR, RING_COLOR];
// Bullitt's ring fades with the zoom and with how many violations the place lists, so
// from afar only the places with a lot stand out, and up close every ring is readable.
// Louisville's rings always show in full: a ring is rare there and means "any violation".
// In November 2026, of 240 Bullitt places 132 listed violations: half of those listed 1,
// a quarter 3 or more, one in ten 4 or more, and the most was 9.
export const BULLITT_RING_FADE = { zoom: [10, 13], count: [1, 5] };
const bullittCountWeight = [
  "interpolate",
  ["linear"],
  ["coalesce", ["get", "violation_count"], 1],
  BULLITT_RING_FADE.count[0],
  0.3,
  BULLITT_RING_FADE.count[1],
  1,
];
const forBullitt = (expr) => ["case", isFormItemRegion, expr, 1];
const ringOpacity = [
  "interpolate",
  ["linear"],
  ["zoom"],
  BULLITT_RING_FADE.zoom[0],
  forBullitt(["*", 0.5, bullittCountWeight]),
  BULLITT_RING_FADE.zoom[1],
  forBullitt(["max", 0.7, bullittCountWeight]),
];

// Circle radius that grows with the zoom level. stops: [[zoom, radius], ...]
const radiusByZoom = (stops) => ["interpolate", ["linear"], ["zoom"], ...stops.flat()];

// Adds the "facilities" source, a circle layer per score band, and the violation
// ring layer. pins: the red/yellow cut-offs the bands start with.
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

  // A ring above a pin marks violations on the place's latest inspection. (Louisville's
  // data also has a yes/no "critical" flag, but it can't tell the Food Code's kinds of
  // violation apart, so the site doesn't use it.)
  const ringStops = [
    [8, phone ? 5.5 : 7.5],
    [11, phone ? 9.5 : 12],
    [14, phone ? 13.5 : 15.5],
    [17, phone ? 17.5 : 19.5],
  ];
  const ringRadius = radiusByZoom(ringStops);
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
        "circle-stroke-opacity": ringOpacity,
      },
    });
  const hasViolations = ["==", ["get", "has_any_violation"], true];
  ring(RING_LAYER, hasViolations, 2.5, ringColor);

  // Invisible (opacity 0, but still found by MapLibre's hit testing), drawn under the pins.
  map.addLayer(
    {
      id: HIT_LAYER,
      type: "circle",
      source: "facilities",
      filter: hasViolations,
      paint: {
        "circle-radius": radiusByZoom(ringStops.map(([z, r]) => [z, r + HIT_PADDING])),
        "circle-opacity": 0,
        "circle-stroke-width": 0,
      },
    },
    PIN_LAYERS[0],
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
