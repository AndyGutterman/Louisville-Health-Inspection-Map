// Same-coordinate handling: several establishments can share one point.

export function coordKey([lon, lat]) {
  return `${lon.toFixed(6)}|${lat.toFixed(6)}`;
}

const GRADE_SEVERITY = { C: 0, B: 1, A: 2 };

export function worstFirst(a, b) {
  const pa = a.properties || {}, pb = b.properties || {};
  // 1. Critical violation present → absolute worst (drives the visible red ring)
  const ca = pa.has_critical_violation ? 0 : 1;
  const cb = pb.has_critical_violation ? 0 : 1;
  if (ca !== cb) return ca - cb;
  // 2. Grade (C=0 worst → A=2 best)
  const ga = GRADE_SEVERITY[pa.grade] ?? 3;
  const gb = GRADE_SEVERITY[pb.grade] ?? 3;
  if (ga !== gb) return ga - gb;
  // 3. Lower score first within the same grade
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
  for (const feats of byCoord.values()) {
    if (feats.length === 1) { out.push(feats[0]); continue; }
    const sorted = feats.slice().sort(worstFirst);
    const rep = sorted[0];
    console.warn(
      `${feats.length} establishments share one coordinate — only "${rep.properties.name}" ` +
      `(eid ${rep.properties.establishment_id}) gets a pin here; the rest are suppressed`,
      sorted.map(f => ({
        establishment_id: f.properties.establishment_id,
        name: f.properties.name,
        address: f.properties.address,
        score: f.properties.score,
        grade: f.properties.grade,
        has_critical_violation: f.properties.has_critical_violation,
      })),
    );
    // Bake every co-located establishment's name + address into the
    // representative's properties so the search filter can still match
    // a business whose own pin got suppressed here.
    const colocatedSearch = sorted
      .map(f => `${f.properties.name || ""} ${f.properties.address_full || f.properties.address || ""}`)
      .join(" | ");
    // Merge violation flags: ring appears if ANY establishment here has violations
    out.push({
      ...rep,
      properties: {
        ...rep.properties,
        has_critical_violation: feats.some(f => f.properties.has_critical_violation),
        has_any_violation:      feats.some(f => f.properties.has_any_violation),
        colocated_search: colocatedSearch,
      },
    });
  }
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
