// Turns the rows Supabase returns into the GeoJSON features the map draws. Pure.
import { classifyCategory } from "./categories.js";
import { tagSimilarNearby } from "./samePlaceDetection.js";
import { DEFAULT_REGION } from "./regions.js";

// "100 W MAIN ST, LOUISVILLE, KY 40202". Missing parts are skipped.
export function joinAddress({ address, city, state, zip }) {
  return [address, city, state].filter(Boolean).join(", ") + (zip ? ` ${zip}` : "");
}

// Supabase can return numeric columns as strings, so coerce before checking.
const toNumber = (v) => (typeof v === "number" ? v : Number(v));
const hasCoordinates = (r) => Number.isFinite(r.lon) && Number.isFinite(r.lat);

/**
 * One feature per establishment, its latest inspection, tagged with similar nearby
 * permits (lib/samePlaceDetection.js). Rows without usable coordinates are dropped
 * and logged, so a missing pin can be traced.
 * @param {object[]} feedRows   rows from v_facility_map_feed
 * @param {Map<string, object>} metaById  establishment id -> { ft, st, address, city, state, zip }
 * @param {Map<string, object>} flagsById establishment id -> { has_any }
 */
export function buildMapFeatures(feedRows, metaById, flagsById) {
  const rows = feedRows
    .map((r) => ({ ...r, lon: toNumber(r.lon), lat: toNumber(r.lat) }))
    .filter((r) => {
      if (hasCoordinates(r)) return true;
      console.warn("Facility missing usable coordinates (no pin will render)", {
        establishment_id: r.establishment_id,
        name: r.premise_name,
        address: r.address,
        raw_lon: r.lon,
        raw_lat: r.lat,
      });
      return false;
    });

  const unmapped = []; // facility type/subtype pairs no category claims
  const features = rows.map((r, i) => {
    const meta = metaById.get(r.establishment_id) || {};
    const flags = flagsById.get(r.establishment_id) || {};
    const ft = typeof meta.ft === "number" ? meta.ft : null;
    const st = typeof meta.st === "number" ? meta.st : null;
    const addressFull = joinAddress({ ...meta, address: meta.address || r.address });
    const cat = ft != null && st != null ? classifyCategory(ft, st) : "unknown";
    if (cat === "unknown" && ft != null && st != null) {
      unmapped.push(`${ft}/${st}`);
    }
    return {
      type: "Feature",
      id: i,
      geometry: { type: "Point", coordinates: [r.lon, r.lat] },
      properties: {
        establishment_id: r.establishment_id,
        name: r.premise_name,
        address: r.address,
        address_full: addressFull,
        zip: meta.zip || null,
        date: r.inspection_date_recent,
        score: r.score_recent,
        grade: r.grade_recent,
        facility_type: ft,
        subtype: st,
        cat,
        has_any_violation: flags.has_any ?? false,
        region: DEFAULT_REGION, // Louisville Metro's data (lib/regions.js)
      },
    };
  });
  if (unmapped.length) {
    const pairs = [...new Set(unmapped)].join(", ");
    console.warn(`${unmapped.length} places have a type no category claims: ${pairs}`);
  }

  // Keep the most recent row per establishment.
  const latest = {};
  for (const f of features) {
    const prev = latest[f.properties.establishment_id];
    if (!prev || (f.properties.date && f.properties.date > prev.properties.date)) {
      latest[f.properties.establishment_id] = f;
    }
  }
  return tagSimilarNearby(Object.values(latest));
}

// Every county's features in one list for the map's single pin source, numbered again so
// ids stay unique (the hover popup tells features apart by id).
export const combineRegions = (...lists) => lists.flat().map((f, i) => ({ ...f, id: i }));
