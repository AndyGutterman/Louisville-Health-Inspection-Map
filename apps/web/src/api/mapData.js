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
// retryIf(error): see lib/retry.js.
export async function readAllPages(page, pageSize = PAGE, onPage, retryIf) {
  let rows = [];
  for (let from = 0; ; from += pageSize) {
    const data = await retry(async (signal) => {
      const { data, error } = await page(from, from + pageSize - 1).abortSignal(signal);
      if (error) throw error;
      return data;
    }, retryIf && { retryIf });
    rows = rows.concat(data || []);
    if (!data || data.length < pageSize) return rows;
    onPage?.(rows);
  }
}

// PostgREST's and Postgres's codes for "no such table or view".
const NO_SUCH_VIEW = new Set(["PGRST205", "42P01"]);

const PIN_COLUMNS =
  "establishment_id,premise_name,address,city,state,zip,facility_type,subtype,lon,lat,inspection_date_recent,score_recent,grade_recent,has_any_violation";

// Rows of v_facility_map_pins: one per place with coordinates, with everything a pin
// needs (name, address, facility type, latest score, violation ring), so Louisville's
// pins cost one read instead of three (migration 20261122000000).
// orFilter limits the read to some categories' places (lib/categories.js
// categoryOrFilter); null reads every place.
// Resolves to the rows; to null if a request fails, so the caller can stop; and to
// undefined when the database doesn't have the view yet, so the caller can fall back to
// the three older reads below (one small failed request, not retried).
// onPage(rowsSoFar) runs after each full page (see readAllPages).
export async function fetchMapPins(onPage, orFilter = null) {
  let missing = false;
  try {
    return await readAllPages(
      (from, to) => {
        const q = publicDb.from("v_facility_map_pins").select(PIN_COLUMNS);
        return (orFilter ? q.or(orFilter) : q).order("establishment_id").range(from, to);
      },
      undefined,
      onPage,
      (e) => !(missing = NO_SUCH_VIEW.has(e?.code)),
    );
  } catch (e) {
    if (missing) return undefined;
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

// The three older reads, used until v_facility_map_pins exists.
//
// Every row of v_facility_map_feed (one per place with coordinates: name, address,
// latest score). Returns null if a request fails, so the caller can stop.
// onPage(rowsSoFar) runs after each full page (see readAllPages).
export async function fetchMapFeed(onPage) {
  try {
    return await readAllPages(
      (from, to) =>
        publicDb
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
      publicDb.rpc("get_violation_flags").range(from, to),
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
      publicDb
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
