/**
 * regions/kyportal/plan.js — what a load of one portal county will write. Pure: store.js
 * does the reading and writing around it.
 */
import { createHash } from "node:crypto";

// A sheet or page with less than half the places of the last load is more likely broken
// than real: stop instead of marking the rest inactive.
export const MIN_SHARE_OF_LAST = 0.5;

// One stored result: a place, a kind and a content hash (the table's unique key).
export const inspectionKey = (i) => `${i.establishment_id}|${i.kind}|${i.content_hash}`;

/**
 * A fingerprint of the parsed places, independent of their order. The page itself can't
 * be hashed: its form state changes on every request.
 */
export function contentSha256(establishments) {
  const canonical = [...establishments]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((e) => [e.id, e.name, e.address, e.city, e.inspections.map((i) => i.content_hash)]);
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/** Throws when this load has far fewer places than the last one. */
export function checkShrink(placeCount, last) {
  if (last && placeCount < last.place_count * MIN_SHARE_OF_LAST) {
    throw new Error(
      `The portal lists ${placeCount} places, the last load had ${last.place_count}. ` +
        "Stopping instead of marking them inactive.",
    );
  }
}

/**
 * @param {object[]} establishments  parsePortalPage(...).establishments
 * @param {object} known
 * @param {Map<string, string>} known.ids  id -> first_seen of every stored place
 * @param {Map<string, string>} known.inspections  inspectionKey -> first_seen of every
 *   stored result
 * @param {string} region             e.g. "oldham"
 * @param {string} day                today, YYYY-MM-DD
 * @returns {{ addedPlaces, keptPlaces, freshInspections, keptInspections }} rows to
 *   insert (first_seen today) and rows to update (last_seen today). Updated rows carry
 *   their stored first_seen: they are written with an upsert, and Postgres checks
 *   first_seen's NOT NULL on the proposed row before it sees the conflict.
 */
export function planLoad(establishments, known, region, day) {
  const place = ({ id, name, address, city, raw_city }) => ({
    id,
    region,
    name,
    address,
    city,
    raw_city,
    last_seen: day,
    active: true,
  });
  const addedPlaces = [];
  const keptPlaces = [];
  const freshInspections = [];
  const keptInspections = [];
  for (const e of establishments) {
    if (known.ids.has(e.id)) keptPlaces.push({ ...place(e), first_seen: known.ids.get(e.id) });
    else addedPlaces.push({ ...place(e), first_seen: day });
    for (const i of e.inspections) {
      const row = {
        establishment_id: e.id,
        region,
        kind: i.kind,
        inspection_date: i.inspection_date,
        score: i.score,
        grade: i.grade,
        violations: i.violations,
        content_hash: i.content_hash,
        last_seen: day,
      };
      const key = inspectionKey(row);
      if (known.inspections.has(key)) {
        keptInspections.push({ ...row, first_seen: known.inspections.get(key) });
      } else freshInspections.push({ ...row, first_seen: day });
    }
  }
  return { addedPlaces, keptPlaces, freshInspections, keptInspections };
}
