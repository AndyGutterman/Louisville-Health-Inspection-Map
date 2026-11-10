// Sorting and labels for the places in a watch area (WatchlistTab.jsx). Pure.

export const SORTS = [
  { key: "distance", label: "Distance" },
  { key: "score", label: "Score" },
  { key: "violations", label: "Violations" },
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
export function violationText(p) {
  const n = p.violations_6mo;
  const noun = n === 1 ? "violation" : "violations";
  return p.region === "bullitt" ? `${n} ${noun} · latest` : `${n} ${noun} · 6 mo`;
}
