// Draws the outline of each covered area (lib/regions.js) under the pins.
import { enabledRegions, outlineLayers, outlineSourceId } from "../../lib/regions.js";
import { PIN_LAYERS } from "./mapLayers.js";

// Adds a GeoJSON source and the outline layers for each enabled region. MapLibre fetches
// the outline file itself; if it fails, the map simply has no outline.
export function addRegionOutlines(map, regions = enabledRegions()) {
  const below = PIN_LAYERS.find((id) => map.getLayer(id)); // keep pins on top
  for (const region of regions) {
    const source = outlineSourceId(region.id);
    if (map.getSource(source)) continue;
    map.addSource(source, {
      type: "geojson",
      data: region.boundaryUrl,
      attribution: region.attribution,
    });
    for (const layer of outlineLayers(region.id)) map.addLayer(layer, below);
  }
}
