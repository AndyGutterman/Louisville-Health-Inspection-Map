// The areas this site has inspection data for, and how their outlines are drawn on the map.
// Pure data and layer specs; features/map/regionOutlines.js puts them on the map.
//
// To cover another county: add its outline to public/regions/<id>.geojson and an entry
// here. A per-region toggle can later switch `enabled`.

export const REGIONS = [
  {
    id: "jefferson",
    name: "Jefferson County (Louisville Metro)",
    boundaryUrl: "/regions/jefferson.geojson",
    enabled: true,
    // CC-BY: the credit shows in the map's attribution control.
    attribution:
      '<a href="https://whosonfirst.org/docs/licenses/" target="_blank" rel="noopener">Who\'s On First</a>',
  },
];

// Neon amber, like the "FOOD" in the header logo.
export const OUTLINE_COLOR = "#fbbf24";

export const outlineSourceId = (regionId) => `region-${regionId}`;

// A soft glow under a dashed line, drawn below the pins.
export function outlineLayers(regionId) {
  const source = outlineSourceId(regionId);
  return [
    {
      id: `${source}-glow`,
      type: "line",
      source,
      layout: { "line-join": "round" },
      paint: {
        "line-color": OUTLINE_COLOR,
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, 5, 13, 9],
        "line-blur": ["interpolate", ["linear"], ["zoom"], 9, 4, 13, 7],
        "line-opacity": 0.3,
      },
    },
    {
      id: `${source}-line`,
      type: "line",
      source,
      layout: { "line-join": "round" },
      paint: {
        "line-color": OUTLINE_COLOR,
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1.5, 13, 2.5],
        "line-dasharray": [3, 2],
      },
    },
  ];
}

export const enabledRegions = (regions = REGIONS) => regions.filter((r) => r.enabled);
