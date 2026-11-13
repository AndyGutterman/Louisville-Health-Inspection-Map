// The areas this site has inspection data for: how their outlines are drawn on the map,
// where the map goes when one is picked, and what each one's data can show. Pure data and
// layer specs; features/map/regionOutlines.js puts the outlines on the map.
//
// To cover another county: add its outline to public/regions/<id>.geojson and an entry
// here (with its `agency`, `source` and `dataNote`, which the Learn page shows). A county
// read from Kentucky's inspection portal (pipeline/regions/kyportal) needs nothing else:
// `feed: "portal"` loads its pins from v_portal_map_feed and its history from
// portal_inspections (lib/portal.js). Bullitt has its own loader (lib/bullitt.js).
//
// `labelAt` is where the county's "Tap to load" button sits while the county is switched
// off (features/map/useCountyLoadLayer.js): a point well inside the outline.
//
// `has` says what a county's data can show, and so where it appears:
//   categories  facility types (the category filter can place its pins)
//   dates       every pin has an inspection date (else undated pins pass the date filter)
//   grades      A/B/C placards
//   saving      saved places and watch areas list it
//   table       Table View lists it
//   formItems   its violations are every inspection-form item marked, not the inspector's
//               citations: rings are much more common, so they are drawn lighter

// Who's On First outlines are CC-BY: the credit shows in the map's attribution control.
const WOF_CREDIT =
  '<a href="https://whosonfirst.org/docs/licenses/" target="_blank" rel="noopener">Who\'s On First</a>';
// Census outlines are public domain; credited all the same.
const CENSUS_CREDIT =
  '<a href="https://tigerweb.geo.census.gov/" target="_blank" rel="noopener">US Census Bureau</a>';

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
    labelAt: [-85.72, 38.2],
    // Louisville Metro's data has facility types, dated inspections and A/B/C placards.
    has: {
      categories: true,
      dates: true,
      grades: true,
      saving: true,
      table: true,
      formItems: false,
    },
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
    labelAt: [-85.7, 37.96],
    // No facility types or placards. Results are dated through Kentucky's inspection
    // portal; the county's sheet, used when the portal isn't answering, has no date for
    // the latest routine inspection, so pins can be undated (dates: false lets those past
    // the date filter). Saving needs the 20261111000000 migration.
    has: {
      categories: false,
      dates: false,
      grades: false,
      saving: true,
      table: true,
      formItems: true,
    },
    agency: {
      name: "Bullitt County Health Department",
      url: "https://www.bullitthealth.org/food",
    },
    source: { name: "Bullitt County Health Department", url: "https://www.bullitthealth.org/food" },
    dataNote:
      "Only each place's latest inspection and its follow-up, dated through Kentucky's statewide inspection portal. When the portal is unavailable, the county's own list is used, which has no inspection date for the latest inspection. No letter grade and no inspector comments: each violation is the name of an item on the inspection form. This site keeps each new score as it appears, so history builds up over time.",
  },
  {
    id: "oldham",
    name: "Oldham County",
    shortName: "Oldham",
    boundaryUrl: "/regions/oldham.geojson",
    enabled: true,
    attribution: CENSUS_CREDIT,
    bounds: [
      [-85.638, 38.285],
      [-85.283, 38.525],
    ],
    labelAt: [-85.45, 38.4],
    feed: "portal",
    // Dated results from Kentucky's portal, no types or placards. Saved places, watch
    // areas, What's New and Table View don't read the portal's tables yet
    // (docs/COUNTIES.md, "What's next").
    has: {
      categories: false,
      dates: true,
      grades: false,
      saving: false,
      table: false,
      formItems: true,
    },
    agency: {
      name: "Oldham County Health Department",
      url: "https://oldhamcountyhealthdepartment.org/environmental/",
    },
    source: {
      name: "Kentucky's food inspection portal",
      url: "https://public.cdpehs.com/KYEnvPBL/VW_PUBLIC_EST_INSP/ShowVW_PUBLIC_EST_INSPTable.aspx?County=93",
    },
    dataNote:
      "Only each place's latest inspection and its follow-up, with their dates, from Kentucky's statewide inspection portal, which the health department links to. It lists hotels, pools and schools as well as food service, and a place can have one result per kind of inspection (a school's kitchen and its playground). No letter grade and no inspector comments: each violation is the name of an item on the inspection form. This site keeps each new score as it appears, so history builds up over time.",
  },
];

export const DEFAULT_REGION = "jefferson";

export const regionById = (id, regions = REGIONS) =>
  regions.find((r) => r.id === id) ?? regions.find((r) => r.id === DEFAULT_REGION);

// The county an establishment id belongs to: every county but Louisville's prefixes its
// ids with its own id ("bullitt-…", "oldham-…"; the pipeline makes them).
export const regionOfId = (eid, regions = REGIONS) =>
  regions.find((r) => r.id !== DEFAULT_REGION && String(eid ?? "").startsWith(`${r.id}-`)) ??
  regionById(DEFAULT_REGION, regions);

// "Bullitt County", "Bullitt County and Oldham County", "A, B and C".
export function nameList(names) {
  if (names.length < 2) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

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

// Regions whose data has no facility types: the category filter can't place their pins.
export const untypedRegionIds = (regions = enabledRegions()) =>
  regions.filter((r) => !r.has.categories).map((r) => r.id);

// Regions whose violations are inspection-form items: lighter, fading rings (mapLayers.js).
export const formItemRegionIds = (regions = enabledRegions()) =>
  regions.filter((r) => r.has.formItems).map((r) => r.id);

// Regions loaded from the portal's tables (lib/portal.js).
export const portalRegionIds = (regions = enabledRegions()) =>
  regions.filter((r) => r.feed === "portal").map((r) => r.id);
