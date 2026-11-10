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
        // Every column: follow_up_violation_count only exists once migration
        // 20261112000000 has run, and naming it before then would fail the whole read.
        .select("*")
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
