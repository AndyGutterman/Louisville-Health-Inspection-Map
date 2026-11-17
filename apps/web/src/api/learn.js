// The Learn page's violation database: how often each violation was cited, and the
// places cited for one. Both are summed in the database; nothing here pages through
// inspection_violations.
import { supabase } from "../lib/supabase.js";

/** Violations and their counts since a date (null: all time). { data, error } */
export const fetchViolationSummary = (sinceDate) =>
  supabase.rpc("get_violation_summary", { since_date: sinceDate ?? null });

/** The places cited for one violation since a date. { data, error } */
export const fetchPlacesWithViolation = (violationDesc, sinceDate) =>
  supabase.rpc("get_establishments_for_violation", {
    p_violation_desc: violationDesc,
    p_since_date: sinceDate ?? null,
  });
