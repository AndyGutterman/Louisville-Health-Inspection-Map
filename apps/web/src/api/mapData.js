// Supabase reads behind the map pins and the info drawer.
import { supabase } from "../lib/supabase.js";

// PostgREST returns at most 1,000 rows per request, so big tables are read in pages.
const PAGE = 1000;

// Reads every row of a query, a page at a time, stopping at the first short page. (No
// separate count request: an exact count runs the whole view or table one more time.)
// page(from, to) returns a Supabase query. Resolves to the rows, or throws the error.
// onPage(rowsSoFar), optional, runs after each page, so pins can show as they arrive.
export async function readAllPages(page, pageSize = PAGE, onPage) {
  let rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw error;
    rows = rows.concat(data || []);
    if (!data || data.length < pageSize) return rows;
    onPage?.(rows);
  }
}

// Every row of v_facility_map_feed (one per place with coordinates: name, address,
// latest score). Returns null if a request fails, so the caller can stop.
// onPage(rowsSoFar) runs after each full page (see readAllPages).
export async function fetchMapFeed(onPage) {
  try {
    return await readAllPages(
      (from, to) =>
        supabase
          .from("v_facility_map_feed")
          .select(
            "establishment_id,premise_name,address,lon,lat,inspection_date_recent,score_recent,grade_recent",
          )
          .order("establishment_id")
          .range(from, to),
      undefined,
      onPage,
    );
  } catch (e) {
    console.error(e);
    return null;
  }
}

// establishment id -> { has_any } for each place's latest inspection (the violation ring;
// the RPC's has_critical column is not used: see mapLayers.js). Empty on an error.
export async function fetchViolationFlags() {
  const flags = new Map();
  try {
    const rows = await readAllPages((from, to) =>
      supabase.rpc("get_violation_flags").range(from, to),
    );
    for (const r of rows) flags.set(r.establishment_id, r);
  } catch (e) {
    console.error("violation flags fetch error", e);
  }
  return flags;
}

// establishment id -> { ft, st, address, city, state, zip } from facilities (type and
// subtype drive the category filter). Empty on an error.
export async function fetchFacilityMeta() {
  const metaById = new Map();
  try {
    const rows = await readAllPages((from, to) =>
      supabase
        .from("facilities")
        .select("establishment_id, facility_type, subtype, address, city, state, zip")
        .order("establishment_id")
        .range(from, to),
    );
    for (const f of rows) {
      metaById.set(f.establishment_id, {
        ft: f.facility_type,
        st: f.subtype,
        zip: f.zip || null,
        address: f.address || null,
        city: f.city || null,
        state: f.state || null,
      });
    }
  } catch (e) {
    console.error("facilities meta fetch error", e);
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
