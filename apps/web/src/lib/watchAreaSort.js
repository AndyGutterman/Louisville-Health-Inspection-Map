// Sorting and labels for the places in a watch area (WatchlistTab.jsx). Pure: labels are
// keys for t() (lib/strings.saved.js); `label` is the English one.
import { translate } from "./i18n.js";

export const SORTS = [
  { key: "distance", label: "Distance", labelKey: "saved.sort.distance" },
  { key: "score", label: "Score", labelKey: "saved.sort.score" },
  { key: "violations", label: "Violations", labelKey: "saved.sort.violations" },
];

export const DEFAULT_SORT = "violations";

// Distance: nearest first. Score: highest first.
// Violations: most violations first (6 months in Jefferson; Bullitt's latest inspection),
// then failing grade, then lowest score.
export function sortPlaces(rows, key) {
  const hi = (r) => (r.score == null || r.score === 0 ? -1 : r.score);
  const lo = (r) => (r.score == null || r.score === 0 ? 999 : r.score);
  const copy = [...rows];
  if (key === "distance") copy.sort((a, b) => (a.distance_mi ?? 1e9) - (b.distance_mi ?? 1e9));
  if (key === "score") copy.sort((a, b) => hi(b) - hi(a));
  if (key === "violations")
    copy.sort(
      (a, b) =>
        (b.violations_6mo ?? 0) - (a.violations_6mo ?? 0) ||
        Number(b.failing) - Number(a.failing) ||
        lo(a) - lo(b),
    );
  return copy;
}

// "3 violations · 6 mo". Bullitt County publishes only the latest inspection, undated,
// so its count is for that inspection.
// t is the useT() word lookup; English without it.
export function violationText(p, t = (key, vars) => translate("en", key, vars)) {
  const n = p.violations_6mo;
  return t(p.region === "bullitt" ? "saved.violLatest" : "saved.viol6mo", { n });
}
