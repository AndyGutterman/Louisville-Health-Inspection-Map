// Table View's paging: which rows a page shows, and which page buttons to draw.

// 100 at most: a page of 500 was about 100 KB from the database for every sort or page turn.
export const PAGE_SIZES = [10, 25, 50, 100];

/**
 * The page actually shown (a page past the end shows the last one) and its row range,
 * 1-based, for "26–50 of 1,234".
 */
export function pageWindow(total, page, pageSize) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const startRow = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endRow = Math.min(safePage * pageSize, total);
  return { totalPages, safePage, startRow, endRow };
}

/**
 * Page buttons: every page when there are 7 or fewer; otherwise the first, the last, the
 * current one and its neighbours, with "…" where pages are skipped.
 */
export function pageList(totalPages, current) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = [
    ...new Set(
      [1, totalPages, current, current - 1, current + 1].filter((p) => p >= 1 && p <= totalPages),
    ),
  ].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < pages.length; i++) {
    if (i > 0 && pages[i] - pages[i - 1] > 1) out.push("…");
    out.push(pages[i]);
  }
  return out;
}
