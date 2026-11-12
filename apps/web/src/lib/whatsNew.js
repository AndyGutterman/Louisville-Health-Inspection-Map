// What's New (WhatsNew.jsx): its tabs, and labels for its rows, from get_latest_inspections /
// get_whats_new / get_top_scores (supabase/migrations/20261111010000_whats_new_both_counties.sql,
// 20261118000000_whats_new_latest.sql). Pure.
import { formatMonthDay } from "./dates.js";

// Left to right; the first is the one that opens. `rpc` is called with { limit_n: 20 }.
export const WHATS_NEW_TABS = [
  {
    id: "latest",
    label: "Latest",
    rpc: "get_latest_inspections",
    empty: "No inspections in the last 30 days.",
  },
  {
    id: "issues",
    label: "Violations",
    rpc: "get_whats_new",
    empty: "No flagged inspections in the last 30 days.",
  },
  {
    id: "perfect",
    label: "Top Scores",
    rpc: "get_top_scores",
    empty: "No perfect scores found.",
  },
];

// The score badge's colour class. The Top Scores tab is all 100s and has its own look.
export function scoreBadge(score, tabId) {
  if (tabId === "perfect") return "perfect";
  if (score == null || score === 0) return "na";
  if (score < 85) return "bad";
  if (score < 95) return "warn";
  return "ok";
}

// The tab a horizontal swipe lands on: left (dx < 0) is the next tab, right the one
// before; it stops at either end.
export function swipeTab(currentId, dx, tabs = WHATS_NEW_TABS) {
  const i = tabs.findIndex((t) => t.id === currentId);
  const next = Math.max(0, Math.min(tabs.length - 1, i + (dx < 0 ? 1 : -1)));
  return tabs[next].id;
}

// The row's date: the inspection date when there is one. A Bullitt routine row has none
// (the health department doesn't publish it), so it shows the day the score was posted
// to the department's sheet instead, labelled as such.
export function whatsNewDate(item) {
  const inspected = item.inspection_date ?? item.inspection_date_recent;
  if (inspected) return formatMonthDay(inspected);
  if (item.posted_date) return `posted ${formatMonthDay(item.posted_date)}`;
  return "";
}
