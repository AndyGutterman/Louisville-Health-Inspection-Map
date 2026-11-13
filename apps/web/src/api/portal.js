// Supabase reads for the counties shown from Kentucky's inspection portal tables (Oldham;
// supabase/migrations/20261121000000_portal_map_feed.sql). All public data: publicDb.
import { publicDb } from "../lib/supabase.js";
import { readAllPages } from "./mapData.js";

// Every row of v_portal_map_feed for these counties (one per place with a pin). Returns
// [] on an error, or with no counties, so a database without the view still shows the
// rest of the map.
export async function fetchPortalFeed(regionIds) {
  if (!regionIds.length) return [];
  try {
    return await readAllPages((from, to) =>
      publicDb
        .from("v_portal_map_feed")
        .select("*")
        .in("region", regionIds)
        .order("establishment_id")
        .range(from, to),
    );
  } catch (e) {
    console.warn("Portal county data unavailable", e.message);
    return [];
  }
}

// Every result recorded for one place. Supabase's { data, error }.
export const fetchPortalInspections = (eid) =>
  publicDb
    .from("portal_inspections")
    .select("id, kind, inspection_date, score, violations, first_seen, last_seen")
    .eq("establishment_id", eid);
