// Supabase reads behind the map pins and the info drawer.
import { supabase } from "../lib/supabase.js";

// PostgREST returns at most 1,000 rows per request, so big tables are read in pages.
const PAGE = 1000;

// Every row of v_facility_map_feed (one per place with coordinates: name, address,
// latest score). Returns null if a request fails, so the caller can stop.
export async function fetchMapFeed() {
  const { count, error: headErr } = await supabase
    .from("v_facility_map_feed")
    .select("*", { head: true, count: "exact" });
  if (headErr) {
    console.error(headErr);
    return null;
  }

  let rows = [];
  for (let offset = 0; offset < count; offset += PAGE) {
    const to = Math.min(count - 1, offset + PAGE - 1);
    const { data, error } = await supabase
      .from("v_facility_map_feed")
      .select(
        "establishment_id,premise_name,address,lon,lat,inspection_date_recent,score_recent,grade_recent",
      )
      .range(offset, to);
    if (error) {
      console.error(error);
      return null;
    }
    rows = rows.concat(data);
  }
  return rows;
}

// establishment id -> { has_any } for each place's latest inspection (the RPC's has_critical
// column is not used: see mapLayers.js)
// (the red and blue rings). Stops quietly on an error.
export async function fetchViolationFlags() {
  const flags = new Map();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.rpc("get_violation_flags").range(from, from + PAGE - 1);
    if (error || !data?.length) break;
    for (const r of data) flags.set(r.establishment_id, r);
    if (data.length < PAGE) break;
  }
  return flags;
}

// establishment id -> { ft, st, address, city, state, zip } from facilities (type and
// subtype drive the category filter). Returns what it has so far on an error.
export async function fetchFacilityMeta() {
  const metaById = new Map();
  try {
    const { count } = await supabase.from("facilities").select("*", { head: true, count: "exact" });
    for (let offset = 0; offset < (count || 0); offset += PAGE) {
      const to = Math.min((count || 0) - 1, offset + PAGE - 1);
      const { data, error } = await supabase
        .from("facilities")
        .select("establishment_id, facility_type, subtype, address, city, state, zip")
        .range(offset, to);
      if (error) {
        console.error("facilities meta fetch error", error);
        break;
      }
      for (const f of data || []) {
        metaById.set(f.establishment_id, {
          ft: f.facility_type,
          st: f.subtype,
          zip: f.zip || null,
          address: f.address || null,
          city: f.city || null,
          state: f.state || null,
        });
      }
    }
  } catch (e) {
    console.error("facilities meta lookup failed", e);
  }
  return metaById;
}

// The drawer's three queries. Each returns Supabase's { data, error }.

// Every inspection for one place, newest first.
export const fetchInspections = (eid) =>
  supabase
    .from("inspections")
    .select("inspection_id, inspection_date, score, grade, ins_type_desc, establishment_id")
    .eq("establishment_id", eid)
    .order("inspection_date", { ascending: false })
    .order("inspection_id", { ascending: false });

// Every violation cited at one place.
export const fetchViolations = (eid) =>
  supabase
    .from("inspection_violations")
    .select(
      "violation_oid, inspection_id, inspection_date, violation_desc, insp_viol_comments, critical_yn, establishment_id",
    )
    .eq("establishment_id", eid);

// "More info" details: opening date, type and subtype names, permit, full address.
export const fetchFacilityDetails = (eid) =>
  supabase
    .from("v_facility_details")
    .select(
      "opening_date, facility_type, subtype, address, city, state, zip, permit_number, facility_type_description, subtype_description",
    )
    .eq("establishment_id", eid)
    .maybeSingle();
