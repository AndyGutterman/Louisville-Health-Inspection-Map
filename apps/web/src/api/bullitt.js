// Supabase reads for Bullitt County (supabase/migrations/20261110000000_bullitt_county.sql).
import { publicDb, supabase } from "../lib/supabase.js";
import { readAllPages } from "./mapData.js";

// Every row of v_bullitt_map_feed (one per place with a pin). Returns null on an error,
// so the caller can say the county couldn't load (the other counties are unaffected).
export async function fetchBullittFeed() {
  try {
    return await readAllPages((from, to) =>
      publicDb
        .from("v_bullitt_map_feed")
        // Every column: follow_up_violation_count only exists once migration
        // 20261112000000 has run, and naming it before then would fail the whole read.
        .select("*")
        .order("establishment_id")
        .range(from, to),
    );
  } catch (e) {
    console.warn("Bullitt County data unavailable", e.message);
    return null;
  }
}

const HISTORY_COLUMNS = "id, kind, inspection_date, score, violations, first_seen, last_seen";

// Every version of one place's inspections we have recorded, from bullitt_results: the
// portal's while it is answering, the sheet's otherwise (migration 20261120000000). Until
// that migration has run, the sheet's table directly. Supabase's { data, error }.
export async function fetchBullittInspections(eid) {
  const read = (table) => supabase.from(table).select(HISTORY_COLUMNS).eq("establishment_id", eid);
  const picked = await read("bullitt_results");
  return picked.error ? read("bullitt_inspections") : picked;
}
