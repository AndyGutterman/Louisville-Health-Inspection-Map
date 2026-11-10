// Supabase reads for Bullitt County (supabase/migrations/20261110000000_bullitt_county.sql).
import { supabase } from "../lib/supabase.js";
import { readAllPages } from "./mapData.js";

// Every row of v_bullitt_map_feed (one per place with a pin). Returns [] on an error, so
// a database without the Bullitt tables still shows Louisville.
export async function fetchBullittFeed() {
  try {
    return await readAllPages((from, to) =>
      supabase
        .from("v_bullitt_map_feed")
        .select(
          "establishment_id,premise_name,address,city,lon,lat,score_recent,violation_count_recent,follow_up_date,follow_up_score",
        )
        .order("establishment_id")
        .range(from, to),
    );
  } catch (e) {
    console.warn("Bullitt County data unavailable", e.message);
    return [];
  }
}

// Every version of one place's inspections we have recorded. Supabase's { data, error }.
export const fetchBullittInspections = (eid) =>
  supabase
    .from("bullitt_inspections")
    .select("id, kind, inspection_date, score, violations, first_seen, last_seen")
    .eq("establishment_id", eid);
