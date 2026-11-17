// Table View's reads: one page of v_table_latest / v_table_inspections at a time, and
// the list of inspection types for its filter. What to ask for is decided in
// lib/tableQuery.js; this only sends it.
import { supabase } from "../lib/supabase.js";

const COLUMNS =
  "region, inspection_id, establishment_id, inspection_date, score, grade, ins_type_desc, name, address, city, zip";

/** The inspection types and how many inspections each has ({ data, error }). */
export const fetchInspectionTypes = () =>
  supabase.from("v_inspection_types").select("ins_type_desc, cnt");

/**
 * One page of the table ({ data, error, count }).
 * @param {object} q
 * @param {string} q.view        "v_table_latest" or "v_table_inspections"
 * @param {boolean} q.wantCount  also count every matching row (asked only when the
 *   filters change: a count is a second query in the database)
 * @param {string} q.col         the column to sort by
 * @param {boolean} q.asc
 * @param {number} q.from        first row of the page
 * @param {number} q.to          last row of the page
 * @param {string[]|null} q.regions  the counties to read; null for all the views hold
 * @param {boolean} q.hideNA     leave out rows with no score
 * @param {Set<string>|null} q.types  inspection types to keep
 * @param {string|null} q.or     search and facility filters (lib/tableQuery.js combineOr)
 */
export function fetchTablePage({
  view,
  wantCount,
  col,
  asc,
  from,
  to,
  regions,
  hideNA,
  types,
  or,
}) {
  let q = supabase
    .from(view)
    .select(COLUMNS, wantCount ? { count: "exact" } : undefined)
    .order(col, { ascending: asc, nullsFirst: false })
    .order("inspection_id", { ascending: false })
    .range(from, to);
  if (regions?.length === 1) q = q.eq("region", regions[0]);
  else if (regions) q = q.in("region", regions);
  if (hideNA) q = q.gt("score", 0);
  if (types) q = q.in("ins_type_desc", [...types]);
  if (or) q = q.or(or);
  return q;
}
