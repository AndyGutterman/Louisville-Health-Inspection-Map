// Score bands and presets. Pure functions: no React, no map instance.

export const SCORE_MIN = 1;
export const RED_CAP = 98;
export const YEL_CAP = 99;

export function clampPins([r, y]) {
  r = Math.max(SCORE_MIN, Math.min(RED_CAP, Math.round(r)));
  y = Math.max(r + 1, Math.min(YEL_CAP, Math.round(y)));
  return [r, y];
}
// Louisville grading: C = score ≤ 84 (or critical violation), A = score ≥ 85.
// "balanced" default aligns with the official 84/85 threshold so red = C territory.
export const PRESETS = {
  loose:    clampPins([75, 89]),
  balanced: clampPins([84, 94]),  // red ≤84 matches Louisville's C-grade cutoff
  strict:   clampPins([90, 96]),
};

// MapLibre filter expressions, one per score band.
export function bandExprs([rMax, yMax]) {
  const GET = ["get", "score"];
  const GETN = ["coalesce", ["get", "score"], -999999];
  return {
    red: ["all", [">=", GETN, 1], ["<=", GETN, rMax]],
    yellow: ["all", [">=", GETN, rMax + 1], ["<=", GETN, yMax]],
    green: ["all", [">=", GETN, yMax + 1], ["<=", GETN, 100]],
    zero: ["==", GET, 0],
    null: ["==", GET, null],
  };
}
