/**
 * lib/geo.js — small geometry helpers for GeoJSON outlines (lon/lat degrees). Pure.
 */

// Ray casting: is [lon, lat] inside a closed ring?
function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Inside the outer ring and outside every hole.
const inPolygon = (point, [outer, ...holes]) =>
  inRing(point, outer) && !holes.some((h) => inRing(point, h));

/** Is [lon, lat] inside any Polygon or MultiPolygon of a FeatureCollection? */
export function containsPoint(featureCollection, point) {
  return featureCollection.features.some(({ geometry: g }) => {
    if (g.type === "Polygon") return inPolygon(point, g.coordinates);
    if (g.type === "MultiPolygon") return g.coordinates.some((p) => inPolygon(point, p));
    return false;
  });
}

/** [west, south, east, north] of every coordinate in a FeatureCollection. */
export function bbox(featureCollection) {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  const visit = (c) => {
    if (typeof c[0] === "number") {
      w = Math.min(w, c[0]);
      e = Math.max(e, c[0]);
      s = Math.min(s, c[1]);
      n = Math.max(n, c[1]);
    } else c.forEach(visit);
  };
  for (const f of featureCollection.features) visit(f.geometry.coordinates);
  return [w, s, e, n];
}
