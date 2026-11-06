// Pan limits for the map.
//
// MapLibre keeps the whole canvas inside maxBounds, including the part covered by the
// info drawer and side panels. So a pin sitting under a panel can only be panned into
// the free part of the screen if the limits leave room for the covered area. The room
// scales with the screen: a wider window means wider panels to clear.

// Louisville Metro plus a buffer: the area people should be able to see.
export const METRO_BOUNDS = [
  [-86.4, 37.7],
  [-85.0, 38.7],
];

const TILE = 512;

// Degrees of longitude across `px` screen pixels at `zoom`.
export const degreesAcross = (px, zoom) => (px * 360) / (TILE * 2 ** zoom);

// Extra room to allow beyond the core box: a fraction of the screen size at the starting
// zoom, kept between a floor and a ceiling so tiny and huge screens both behave.
export function panMargin(px, zoom, { fraction = 0.6, min = 0.3, max = 0.9 } = {}) {
  return Math.min(max, Math.max(min, degreesAcross(px, zoom) * fraction));
}

// The core box with slack on every side. A pixel spans fewer degrees of latitude than of
// longitude, so the vertical slack is scaled by cos(latitude).
export function looseBounds(core, { width, height, zoom, latitude = 38.25 }) {
  const [[w, s], [e, n]] = core;
  const mx = panMargin(width, zoom);
  const my = panMargin(height * Math.cos((latitude * Math.PI) / 180), zoom);
  return [
    [w - mx, s - my],
    [e + mx, n + my],
  ];
}
