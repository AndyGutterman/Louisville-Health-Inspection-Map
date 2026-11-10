// The areas this site has inspection data for: how their outlines are drawn on the map,
// where the map goes when one is picked, and what each one's data can show. Pure data and
// layer specs; features/map/regionOutlines.js puts the outlines on the map.
//
// To cover another county: add its outline to public/regions/<id>.geojson and an entry
// here (with its `agency`, `source` and `dataNote`, which the Learn page shows), plus a loader for its
// data (see lib/bullitt.js).

// Who's On First outlines are CC-BY: the credit shows in the map's attribution control.
const WOF_CREDIT =
  '<a href="https://whosonfirst.org/docs/licenses/" target="_blank" rel="noopener">Who\'s On First</a>';

export const REGIONS = [
  {
    id: "jefferson",
    name: "Jefferson County (Louisville Metro)",
    shortName: "Jefferson",
    boundaryUrl: "/regions/jefferson.geojson",
    enabled: true,
    attribution: WOF_CREDIT,
    bounds: [
      [-85.947, 37.997],
      [-85.405, 38.38],
    ],
    // Louisville Metro's data has facility types, dated inspections and A/B/C placards.
    has: { categories: true, dates: true, grades: true, saving: true },
    agency: {
      name: "Louisville Metro Department of Public Health and Wellness",
      url: "https://louisvilleky.gov/government/health-wellness/food-safety",
    },
    // The Learn page links `source` and shows `dataNote` (the full dataset list is in
    // pipeline/DataSourceLinks_Quicklist.txt).
    source: { name: "Louisville Metro Open Data", url: "https://data.louisvilleky.gov/" },
    dataNote:
      "Every inspection back to about 2016, each with its date, score and A/B/C placard. Each violation names the Food Code item and includes the inspector's comments.",
  },
  {
    id: "bullitt",
    name: "Bullitt County",
    shortName: "Bullitt",
    boundaryUrl: "/regions/bullitt.geojson",
    enabled: true,
    attribution: WOF_CREDIT,
    bounds: [
      [-85.938, 37.806],
      [-85.429, 38.118],
    ],
    // The health department's sheet has no facility types, no date for the latest
    // inspection and no placards. Saving needs the 20261111000000 migration.
    has: { categories: false, dates: false, grades: false, saving: true },
    agency: {
      name: "Bullitt County Health Department",
      url: "https://www.bullitthealth.org/food",
    },
    source: { name: "Bullitt County Health Department", url: "https://www.bullitthealth.org/food" },
    dataNote:
      "Only each place's latest inspection and its follow-up, with no inspection date, no letter grade and no inspector comments: each violation is the name of an item on the inspection form. This site keeps each new score as it appears, so history builds up over time.",
  },
];

export const DEFAULT_REGION = "jefferson";

export const regionById = (id, regions = REGIONS) =>
  regions.find((r) => r.id === id) ?? regions.find((r) => r.id === DEFAULT_REGION);

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

// Regions whose data has no inspection dates: the date filter lets their pins through.
export const undatedRegionIds = (regions = enabledRegions()) =>
  regions.filter((r) => !r.has.dates).map((r) => r.id);
