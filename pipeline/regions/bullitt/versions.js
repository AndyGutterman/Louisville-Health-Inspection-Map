/**
 * regions/bullitt/versions.js — which of today's inspections are new. Pure.
 *
 * The sheet only ever shows each place's latest routine inspection and follow-up. A result
 * whose content (score, violations, follow-up date) matches no version already stored for
 * that place is a new version, stored with first_seen = today. Because the job runs daily,
 * first_seen is the day the department posted the result, which is how the website dates
 * routine inspections the sheet leaves undated (apps/web/src/lib/bullitt.js).
 */

// One stored version: a place, a kind (routine or follow_up) and a content hash.
export const versionKey = (i) => `${i.establishment_id}|${i.kind}|${i.content_hash}`;

/**
 * @param {object[]} establishments  parseSheet(...).establishments
 * @param {Set<string>} seenKeys       versionKey of every stored inspection
 * @param {string} day                 today, YYYY-MM-DD
 * @returns {{ fresh: object[], kept: object[] }} rows to insert (first_seen and last_seen
 *   today) and rows already stored (last_seen today)
 */
export function planVersions(establishments, seenKeys, day) {
  const fresh = [];
  const kept = [];
  for (const e of establishments) {
    for (const i of [e.routine, e.follow_up]) {
      if (!i) continue;
      const row = { establishment_id: e.id, ...i, last_seen: day };
      if (seenKeys.has(versionKey(row))) kept.push(row);
      else fresh.push({ ...row, first_seen: day });
    }
  }
  return { fresh, kept };
}
