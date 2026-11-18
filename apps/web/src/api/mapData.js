// Supabase reads behind the map pins and the info drawer (all public data: publicDb).
import { publicDb } from "../lib/supabase.js";
import { retry } from "../lib/retry.js";

// PostgREST returns at most 1,000 rows per request, so big tables are read in pages.
const PAGE = 1000;

// Reads every row of a query, a page at a time, stopping at the first short page. (No
// separate count request: an exact count runs the whole view or table one more time.)
// page(from, to) returns a Supabase query. Resolves to the rows, or throws the error.
// onPage(rowsSoFar), optional, runs after each page, so pins can show as they arrive.
// Each page gets a time limit and two more tries (lib/retry.js): on a phone a request
// can go unanswered, and the map would otherwise say "Loading places…" forever. A try
// that runs out of time is cancelled, so the same page is never downloaded twice at once.
export async function readAllPages(page, pageSize = PAGE, onPage) {
  let rows = [];
  for (let from = 0; ; from += pageSize) {
    const data = await retry(async (signal) => {
      const { data, error } = await page(from, from + pageSize - 1).abortSignal(signal);
      if (error) throw error;
      return data;
    });
    rows = rows.concat(data || []);
    if (!data || data.length < pageSize) return rows;
    onPage?.(rows);
  }
}

const PIN_COLUMNS =
  "establishment_id,premise_name,address,city,state,zip,facility_type,subtype,lon,lat,inspection_date_recent,score_recent,grade_recent,has_any_violation";

// Rows of v_facility_map_pins: one per place with coordinates, with everything a pin
// needs (name, address, facility type, latest score, violation ring), in one read
// (migration 20261122000000).
// orFilter limits the read to some categories' places (lib/categories.js
// categoryOrFilter); null reads every place.
// Resolves to the rows, or to null if a request fails, so the caller can stop (the pages
// already read stay on the map, and the corner indicator offers to try again).
// onPage(rowsSoFar) runs after each full page (see readAllPages).
export async function fetchMapPins(onPage, orFilter = null) {
  try {
    return await readAllPages(
      (from, to) => {
        const q = publicDb.from("v_facility_map_pins").select(PIN_COLUMNS);
        return (orFilter ? q.or(orFilter) : q).order("establishment_id").range(from, to);
      },
      undefined,
      onPage,
    );
  } catch (e) {
    console.error(e);
    return null;
  }
}

// The pins of a few places by id (a saved place, or one opened from a list, whose
// category isn't loaded): one small read, at most 100 ids. Resolves to the rows, or to
// null on an error.
export async function fetchPinsById(eids) {
  try {
    return await retry(async (signal) => {
      const { data, error } = await publicDb
        .from("v_facility_map_pins")
        .select(PIN_COLUMNS)
        .in("establishment_id", eids.slice(0, 100))
        .abortSignal(signal);
      if (error) throw error;
      return data ?? [];
    });
  } catch (e) {
    console.error(e);
    return null;
  }
}

// The drawer's three queries. Each returns Supabase's { data, error }.
// Public data, so publicDb: they never wait on the sign-in session.

// Every inspection for one place, newest first.
export const fetchInspections = (eid) =>
  publicDb
    .from("inspections")
    .select("inspection_id, inspection_date, score, grade, ins_type_desc, establishment_id")
    .eq("establishment_id", eid)
    .order("inspection_date", { ascending: false })
    .order("inspection_id", { ascending: false });

// Every violation cited at one place.
export const fetchViolations = (eid) =>
  publicDb
    .from("inspection_violations")
    .select(
      "violation_oid, inspection_id, inspection_date, violation_desc, insp_viol_comments, critical_yn, establishment_id",
    )
    .eq("establishment_id", eid);

// "More info" details: opening date, type and subtype names, permit, full address.
export const fetchFacilityDetails = (eid) =>
  publicDb
    .from("v_facility_details")
    .select(
      "opening_date, facility_type, subtype, address, city, state, zip, permit_number, facility_type_description, subtype_description",
    )
    .eq("establishment_id", eid)
    .maybeSingle();
