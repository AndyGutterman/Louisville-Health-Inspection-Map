/**
 * lib/paging.js — read a whole result set through PostgREST, which caps any one response
 * at 1,000 rows (Supabase's default) without an error. Pure: the client is passed in.
 *
 *   readAllPages((from, to) => supa.from("t").select("c").order("c").range(from, to))
 *   selectAll(supa, "t", "c", { order: "c" })
 *
 * Always order by a unique column: a range read with no stable order can skip or repeat
 * rows between pages.
 */
export const PAGE = 1000;

export async function readAllPages(page, pageSize = PAGE) {
  const all = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw new Error(error.message ?? String(error));
    const rows = data || [];
    all.push(...rows);
    if (rows.length < pageSize) return all;
  }
}

export const selectAll = (supa, table, columns, { order }) =>
  readAllPages((from, to) => supa.from(table).select(columns).order(order).range(from, to));
