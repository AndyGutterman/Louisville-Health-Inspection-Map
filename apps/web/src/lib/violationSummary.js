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
