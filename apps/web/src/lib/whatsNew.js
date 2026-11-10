// Labels for What's New rows (WhatsNew.jsx), from get_whats_new / get_top_scores
// (supabase/migrations/20261111010000_whats_new_both_counties.sql). Pure.
import { formatMonthDay } from "./dates.js";

// The row's date: the inspection date when there is one. A Bullitt routine row has none
// (the health department doesn't publish it), so it shows the day the score was posted
// to the department's sheet instead, labelled as such.
export function whatsNewDate(item) {
  const inspected = item.inspection_date ?? item.inspection_date_recent;
  if (inspected) return formatMonthDay(inspected);
  if (item.posted_date) return `posted ${formatMonthDay(item.posted_date)}`;
  return "";
}
