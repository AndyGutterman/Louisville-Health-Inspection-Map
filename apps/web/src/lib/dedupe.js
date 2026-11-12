// Same-coordinate handling: several establishments can share one point.
import { featureSearchKey } from "./searchText.js";

export function coordKey([lon, lat]) {
  return `${lon.toFixed(6)}|${lat.toFixed(6)}`;
}

const GRADE_SEVERITY = { C: 0, B: 1, A: 2 };

export function worstFirst(a, b) {
  const pa = a.properties || {},
    pb = b.properties || {};
  // 1. Grade (C=0 worst → A=2 best)
  const ga = GRADE_SEVERITY[pa.grade] ?? 3;
  const gb = GRADE_SEVERITY[pb.grade] ?? 3;
  if (ga !== gb) return ga - gb;
  // 2. Lower score first within the same grade
  return (pa.score ?? 100) - (pb.score ?? 100);
}

// Collapse same-coordinate features into one rendered circle (worst representative).
// The FULL feature list stays in coordIndexRef for popup navigation — only
// the RENDERED GeoJSON is deduplicated so strokes never stack additively.
export function deduplicateForRender(featureList) {
  const byCoord = new Map();
  for (const f of featureList) {
    const k = coordKey(f.geometry.coordinates);
    if (!byCoord.has(k)) byCoord.set(k, []);
    byCoord.get(k).push(f);
  }
  const out = [];
  let stacked = 0;
  for (const feats of byCoord.values()) {
    if (feats.length === 1) {
      const f = feats[0];
      out.push({
        ...f,
        properties: { ...f.properties, search_key: featureSearchKey(f.properties) },
      });
      continue;
    }
    const sorted = feats.slice().sort(worstFirst);
    const rep = sorted[0];
    stacked++;
    // Bake every co-located establishment's search key into the representative's
    // properties so the search filter can still match a business whose own pin got
    // suppressed here (lib/searchText.js).
    const searchKeyAll = sorted.map((f) => featureSearchKey(f.properties)).join(" ");
    // Merge violation flags: ring appears if ANY establishment here has violations
    out.push({
      ...rep,
      properties: {
        ...rep.properties,
        has_any_violation: feats.some((f) => f.properties.has_any_violation),
        violation_count: Math.max(...feats.map((f) => f.properties.violation_count ?? 0)),
        search_key: searchKeyAll,
      },
    });
  }
  // One line, not one per spot: a warning per spot was hundreds of console entries on
  // every load, which is slow with DevTools open.
  if (stacked) console.warn(`${stacked} spots have several places; each draws one pin.`);
  return out;
}

export function buildCoordIndex(features) {
  const m = new Map();
  for (const f of features) {
    const k = coordKey(f.geometry.coordinates);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(f);
  }
  return m;
}
