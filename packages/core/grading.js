/**
 * grading.js — how a score reads, the same everywhere: the site's badges, What's New,
 * Table View, Saved, and the emails. Louisville's own line is 85: under it is a C
 * placard. 95 and up is the top band.
 */
export const FAIL_SCORE = 85;
export const TOP_SCORE = 95;

const isC = (grade) => String(grade ?? "").toUpperCase() === "C";

/** Failing: a C placard, or a score under 85. A place with no score isn't failing. */
export const isFailing = ({ score, grade }) => isC(grade) || (score ?? 100) < FAIL_SCORE;

/**
 * The colour band of a score badge: "ok" (95 and up), "warn" (85 to 94), "bad" (under
 * 85), or "na" for no score (the data writes a missing score as null or 0).
 */
export function scoreBand(score) {
  const n = score == null ? NaN : Number(score);
  if (!Number.isFinite(n) || n <= 0) return "na";
  return n >= TOP_SCORE ? "ok" : n >= FAIL_SCORE ? "warn" : "bad";
}
