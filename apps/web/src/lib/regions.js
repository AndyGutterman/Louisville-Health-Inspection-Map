// The areas this site has inspection data for: how their outlines are drawn on the map,
// where the map goes when one is picked, and what each one's data can show. Pure data and
// layer specs; features/map/regionOutlines.js puts the outlines on the map.
//
// To cover another county: add its outline to public/regions/<id>.geojson and an entry
// here (with its `agency` and `sources`, which the Learn page lists), plus a loader for its
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
    // Where this county's data comes from (pipeline/DataSourceLinks_Quicklist.txt).
    sources: [
      {
        name: "Louisville Metro Open Data",
        url: "https://data.louisvilleky.gov/",
        about: "The city's open data portal, home of the datasets below.",
      },
      {
        name: "Food service inspections (FoodServiceData)",
        url: "https://services1.arcgis.com/79kfd2K6fskCAkyg/ArcGIS/rest/services/FoodServiceData/FeatureServer/0",
        about: "Every inspection with its date, score and grade, plus each place's location.",
      },
      {
        name: "Inspection violations",
        url: "https://services1.arcgis.com/79kfd2K6fskCAkyg/ArcGIS/rest/services/Louisville_Metro_KY_Inspection_Violations_of_Failed_Restaurants/FeatureServer/0",
        about: "The violations cited at each inspection, with inspector comments.",
      },
      {
        name: "Permitted food service establishments",
        url: "https://services1.arcgis.com/79kfd2K6fskCAkyg/ArcGIS/rest/services/Louisville_Metro_KY_Permitted_Food_Service_Establishments/FeatureServer/0",
        about: "Each permit's facility type and subtype (the category filter) and opening date.",
      },
      {
        name: "Facility types and subtypes",
        url: "https://services1.arcgis.com/79kfd2K6fskCAkyg/ArcGIS/rest/services/Louisville_Metro_KY_Permitted_Food_Service_Types_with_Subtypes/FeatureServer/0",
        about: "The names behind the type and subtype codes.",
      },
    ],
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
    sources: [
      {
        name: "Food inspection scores",
        url: "https://www.bullitthealth.org/food",
        about:
          "The department's Inspection Scores page: each place's latest score and violations, updated weekly, without the inspection date.",
      },
      {
        name: "Inspection scores sheet",
        url: "https://docs.google.com/spreadsheets/d/1f5jInKfN7_oGSXy_o0wdYEU1tVwUd5TPP_Uk5H-pTYY/",
        about: "The public Google Sheet behind that page, which this site reads.",
      },
      {
        name: "Kentucky 911 address points",
        url: "https://kygisserver.ky.gov/arcgis/rest/services/WGS84WM_Services/Ky_911_Site_Structure_Address_Points_WGS84WM/MapServer/0",
        about: "The state's address points, used to place pins the other geocoders miss.",
      },
    ],
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

// Sources every county shares: the map itself and the geocoders behind its pins.
export const SHARED_SOURCES = [
  {
    name: "Who's On First",
    url: "https://whosonfirst.org/",
    about: "County outlines (CC-BY).",
  },
  {
    name: "CARTO basemap and OpenStreetMap",
    url: "https://carto.com/attributions",
    about: "The dark map tiles, built from OpenStreetMap data.",
  },
  {
    name: "Nominatim (OpenStreetMap)",
    url: "https://nominatim.org/",
    about: "Geocoding for places whose records have an address but no location.",
  },
  {
    name: "U.S. Census Geocoder",
    url: "https://geocoding.geo.census.gov/",
    about: "A second geocoder for addresses Nominatim can't find.",
  },
  {
    name: "Geoapify",
    url: "https://www.geoapify.com/",
    about: "Address search when you add a watch area.",
  },
];

// Regions whose data has no inspection dates: the date filter lets their pins through.
export const undatedRegionIds = (regions = enabledRegions()) =>
  regions.filter((r) => !r.has.dates).map((r) => r.id);
