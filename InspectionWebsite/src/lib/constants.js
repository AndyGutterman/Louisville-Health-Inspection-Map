// ─── Draw order + score bands ─────────────────────────────────────────────────

export const DRAW_ORDER = ["null", "green", "yellow", "zero", "red"];

const SCORE_MIN = 1;
const SCORE_MAX = 99;
const RED_CAP   = 98;
const YEL_CAP   = 99;

export function clampPins([r, y]) {
  r = Math.max(SCORE_MIN, Math.min(RED_CAP, Math.round(r)));
  y = Math.max(r + 1,    Math.min(YEL_CAP, Math.round(y)));
  return [r, y];
}

export const PRESETS = {
  loose:    clampPins([75, 89]),
  balanced: clampPins([85, 94]),
  strict:   clampPins([90, 96]),
};

// ─── Category specs ───────────────────────────────────────────────────────────

export const CATEGORY_SPECS = {
  restaurants:          { label: "Restaurants",          subs: [{ ft: 605, st: 11 }] },
  schools:              { label: "Schools",              subs: [{ ft: 605, st: 33 }] },
  daycare:              { label: "Daycare",              subs: [{ ft: 605, st: 31 }] },
  hospitals:            { label: "Hospitals & Nursing",  subs: [{ ft: 605, st: 32 }] },
  concessions: {
    label: "Concessions",
    subs: [{ ft: 603, st: 51 }, { ft: 603, st: 53 }],
  },
  caterers_commissary: {
    label: "Caterers & Commissaries",
    subs: [{ ft: 605, st: 42 }, { ft: 605, st: 43 }],
  },
  retail: {
    label: "Retail",
    subs: [
      { ft: 610, st: 61 }, { ft: 610, st: 62 }, { ft: 610, st: 63 },
      { ft: 610, st: 64 }, { ft: 610, st: 65 }, { ft: 610, st: 73 },
      { ft: 610, st: 212 }, { ft: 607, st: 54 }, { ft: 607, st: 55 },
      { ft: 605, st: 54 },
    ],
  },
  unknown: {
    label: "Other / Unknown",
    subs: [
      { ft: 605, st: 36 }, { ft: 604, st: 16 },
      { ft: 605, st: 52 }, { ft: 610, st: 73 },
    ],
  },
};

// ─── Same-place detection thresholds ─────────────────────────────────────────

export const COORD_SNAP        = 0.0005; // ~55m grid at Louisville latitude
export const SAME_PLACE_MAX_M  = 80;
export const SAME_PLACE_MIN_SIM = 0.60;

export const DEPT_WORDS = new Set([
  "gas", "deli", "pharmacy", "bakery", "cafe", "coffee", "express", "grill",
  "bar", "kitchen", "bistro", "market", "fuel", "floral", "optical", "vision",
  "salon", "spa", "food", "court", "stand", "kiosk", "counter", "liquor", "wine",
]);

// ─── Map geometry ─────────────────────────────────────────────────────────────

export const EDGE_ZONE = 24;
export const SPURT_PX  = 60;
export const MIN_ZOOM  = 11;
