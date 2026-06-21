import { DRAW_ORDER } from "./constants.js";
import { PIN_COLORS } from "../Colors.jsx";

/**
 * setupMapLayers — adds the GeoJSON source and five score-band circle layers.
 *
 * Call this once inside map.on('load', ...).
 * Returns the array of layer IDs for use in event listener registration.
 *
 * @param {maplibregl.Map} map
 * @param {object}         geoData   GeoJSON FeatureCollection
 * @param {[number,number]} initialPins  [rMax, yMax] score thresholds
 * @returns {string[]} layerIds
 */
export function setupMapLayers(map, geoData, initialPins) {
  map.addSource("facilities", { type: "geojson", data: geoData });

  const basePaint = {
    "circle-radius": [
      "interpolate",
      ["linear"],
      ["zoom"],
      8,  window.innerWidth <= 600 ? 4  : 6,
      11, window.innerWidth <= 600 ? 8  : 10.5,
      14, window.innerWidth <= 600 ? 12 : 14,
      17, window.innerWidth <= 600 ? 16 : 18,
    ],
    "circle-opacity": 0.9,
    "circle-stroke-width": 2,
    "circle-stroke-color": "rgba(0,0,0,0.4)",
    "circle-blur": 0.25,
  };

  const exprs = bandExprs(initialPins);
  for (const key of DRAW_ORDER) {
    map.addLayer({
      id: `points-${key}`,
      type: "circle",
      source: "facilities",
      paint: { ...basePaint, "circle-color": PIN_COLORS[key] ?? PIN_COLORS.green },
      filter: exprs[key],
    });
  }

  return DRAW_ORDER.map((k) => `points-${k}`);
}

function bandExprs([rMax, yMax]) {
  const GET  = ["get", "score"];
  const GETN = ["coalesce", ["get", "score"], -999999];
  return {
    red:    ["all", [">=", GETN, 1],        ["<=", GETN, rMax]],
    yellow: ["all", [">=", GETN, rMax + 1], ["<=", GETN, yMax]],
    green:  ["all", [">=", GETN, yMax + 1], ["<=", GETN, 100]],
    zero:   ["==", GET, 0],
    null:   ["==", GET, null],
  };
}
