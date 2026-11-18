// Table View's footer: which rows are shown, the page buttons and the page size.
import { useT } from "../../I18nContext.jsx";
import { PAGE_SIZES, pageList, pageWindow } from "../../lib/tablePaging.js";

export default function TableFooter({ isPhone, total, page, pageSize, setPage, setPageSize }) {
  const { t, locale } = useT();
  const { totalPages, safePage, startRow, endRow } = pageWindow(total, page, pageSize);
  const pageButtons = pageList(totalPages, safePage);
  const range =
    total === 0
      ? t("table.noResults")
      : t("table.range", {
          start: startRow,
          end: endRow,
          total: total.toLocaleString(locale),
        });

  return isPhone ? (
    <div className="table-footer table-footer--phone">
      <span className="table-result-count">{range}</span>
      <div className="table-pagination">
        <button
          className="tbl-pg-btn"
          aria-label={t("table.prevPage")}
          disabled={safePage === 1}
          onClick={() => setPage((p) => p - 1)}
        >
          ‹
        </button>
        <span className="tbl-pg-of">
          {safePage} / {totalPages.toLocaleString(locale)}
        </span>
        <button
          className="tbl-pg-btn"
          aria-label={t("table.nextPage")}
          disabled={safePage === totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          ›
        </button>
      </div>
      <select
        className="tbl-size-select"
        aria-label={t("table.rowsPerPage")}
        value={pageSize}
        onChange={(e) => setPageSize(Number(e.target.value))}
      >
        {PAGE_SIZES.map((n) => (
          <option key={n} value={n}>
            {t("table.perPageOption", { n })}
          </option>
        ))}
      </select>
    </div>
  ) : (
    <div className="table-footer">
      <span className="table-result-count">{range}</span>
      <div className="table-page-size">
        <span>{t("table.perPage")}</span>
        {PAGE_SIZES.map((n) => (
          <button
            key={n}
            className={`tbl-size-btn ${pageSize === n ? "active" : ""}`}
            onClick={() => setPageSize(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="table-pagination">
        <button
          className="tbl-pg-btn"
          disabled={safePage === 1}
          onClick={() => setPage((p) => p - 1)}
        >
          ‹
        </button>
        {pageButtons.map((p, i) =>
          p === "…" ? (
            <span key={`e${i}`} className="tbl-pg-ellipsis">
              …
            </span>
          ) : (
            <button
              key={p}
              className={`tbl-pg-btn ${safePage === p ? "active" : ""}`}
              onClick={() => setPage(p)}
            >
              {p}
            </button>
          ),
        )}
        <button
          className="tbl-pg-btn"
          disabled={safePage === totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          ›
        </button>
      </div>
    </div>
  );
}
