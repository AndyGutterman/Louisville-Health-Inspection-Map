// The info drawer lists an inspection's violations one kind at a time: the city's data
// cites the same violation once per food item, so those become one row with a count.

/**
 * @param {object[]} violations  one inspection's citations (violation_desc, insp_viol_comments, ...)
 * @returns {object[]} one per description, in first-cited order: the first citation's
 *   fields, `_count` citations, and every distinct comment joined with " | "
 */
export function groupViolations(violations) {
  const byDesc = new Map();
  for (const v of violations || []) {
    const key = v.violation_desc || "Unknown";
    const group = byDesc.get(key);
    if (!group) {
      byDesc.set(key, {
        ...v,
        _count: 1,
        _comments: v.insp_viol_comments ? [v.insp_viol_comments] : [],
      });
      continue;
    }
    group._count++;
    const c = v.insp_viol_comments;
    if (c && !group._comments.includes(c)) group._comments.push(c);
  }
  return [...byDesc.values()].map((v) => ({ ...v, insp_viol_comments: v._comments.join(" | ") }));
}
