// Which pin a tap or hover means, given the features MapLibre found near the pointer.
// The map passes in a screen-distance function; everything else here is pure.

// The violation ring (features/map/mapLayers.js), and an invisible, wider circle under it
// that gives ringed places a bigger tap target.
export const RING_LAYER = "points-violation-ring";
export const HIT_LAYER = "points-violation-hit";
const HELPER_LAYERS = new Set([RING_LAYER, HIT_LAYER]);

// Pixels of head start a feature gets when picking the closest one. Red beats yellow,
// which beats green, and a place with violations (a ring) gets a bonus on top, so a bad
// result is never hidden behind a good one beside it.
const BAND_BONUS = { "points-red": 10, "points-yellow": 5 };
export const RING_BONUS = 8;

export function pinPriority(f) {
  return (BAND_BONUS[f.layer?.id] ?? 0) + (f.properties?.has_any_violation ? RING_BONUS : 0);
}

// One hit per place: a ringed place can be found on its pin layer, the ring and the tap
// target. Prefer the pin layer's copy (it says which score band the pin is in).
export function uniqueHits(hits) {
  const byId = new Map();
  for (const h of hits) {
    const id = h.properties?.establishment_id;
    const seen = byId.get(id);
    if (!seen || (HELPER_LAYERS.has(seen.layer?.id) && !HELPER_LAYERS.has(h.layer?.id))) {
      byId.set(id, h);
    }
  }
  return [...byId.values()];
}

/**
 * @param {object[]} hits             features near the pointer (pin and ring layers)
 * @param {(f: object) => number} distance  screen distance from the pointer to a feature
 * @returns {object|null} the feature the pointer means
 */
export function pickPin(hits, distance) {
  let best = null;
  for (const f of uniqueHits(hits)) {
    if (!best || distance(f) - pinPriority(f) < distance(best) - pinPriority(best)) best = f;
  }
  return best;
}
