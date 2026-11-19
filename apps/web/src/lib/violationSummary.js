// Totals violation citations by description for the Learn page's violation database.
// The source rows can repeat a description (the database groups by its yes/no
// "critical" flag too), so they are merged here. The flag itself is not shown: it can't
// tell the Food Code's kinds of violation apart (see LearnPage).

/**
 * @param {{ desc: string|null, count: number }[]} rows
 * @returns {{ desc: string, count: number }[]} one row per description, most cited first
 */
export function summarizeViolations(rows) {
  const byDesc = new Map();
  for (const { desc, count } of rows) {
    if (!desc) continue;
    byDesc.set(desc, (byDesc.get(desc) ?? 0) + (Number(count) || 0));
  }
  return [...byDesc]
    .map(([desc, count]) => ({ desc, count }))
    .sort((a, b) => b.count - a.count || a.desc.localeCompare(b.desc));
}

/**
 * A violation's rough share of all citations, for the list in place of a raw count:
 * "~18%" at 10% and up, one decimal below that ("~4.4%"), "<0.1%" for the rarest.
 * @param {number} count citations of this violation
 * @param {number} total citations of every violation
 * @param {string} [locale] for the decimal mark ("~4,4%" in Spanish)
 * @returns {string} "" when there is nothing to divide by
 */
export function citationShare(count, total, locale) {
  if (!(total > 0) || !(count > 0)) return "";
  const pct = (count / total) * 100;
  const fmt = (n, digits) =>
    n.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  if (pct < 0.1) return `<${fmt(0.1, 1)}%`;
  return pct >= 10 ? `~${fmt(Math.round(pct), 0)}%` : `~${fmt(pct, 1)}%`;
}
