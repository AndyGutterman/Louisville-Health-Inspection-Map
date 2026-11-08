// Shapes an establishment's inspections and violations for the info drawer. Pure.

/**
 * Each inspection with its violations attached. A violation belongs to an inspection
 * when its inspection_id matches, or when it was cited on the same date (the city's
 * data doesn't always link them by id). Duplicates are dropped.
 * @param {object[]} inspections  newest first
 * @param {object[]} violations
 */
export function attachViolations(inspections, violations) {
  const byId = new Map();
  const byDate = new Map();
  for (const v of violations || []) {
    if (v.inspection_id != null) {
      if (!byId.has(v.inspection_id)) byId.set(v.inspection_id, []);
      byId.get(v.inspection_id).push(v);
    }
    if (v.inspection_date) {
      if (!byDate.has(v.inspection_date)) byDate.set(v.inspection_date, []);
      byDate.get(v.inspection_date).push(v);
    }
  }
  return (inspections || []).map((r) => {
    const seen = new Set();
    const attached = [];
    for (const v of [
      ...(byId.get(r.inspection_id) || []),
      ...(byDate.get(r.inspection_date) || []),
    ]) {
      const key = v.violation_oid || `${v.inspection_id}-${v.violation_desc}`;
      if (seen.has(key)) continue;
      seen.add(key);
      attached.push(v);
    }
    return { ...r, violations: attached };
  });
}

/**
 * The inspection the drawer's header card shows: the newest one, unless it has no
 * score (follow-ups and complaints often score 0), then the newest with a score.
 * @param {object[]} rows  newest first
 */
export function pickHeaderInspection(rows) {
  const latest = rows[0] || null;
  if (latest && (latest.score ?? 0) > 0) return latest;
  return rows.find((r) => (r.score ?? 0) > 0) || latest;
}

// The "may also be listed as" list baked into a feature (lib/samePlaceDetection.js).
export function parseSimilarNearby(json) {
  try {
    return JSON.parse(json || "[]");
  } catch {
    return [];
  }
}
