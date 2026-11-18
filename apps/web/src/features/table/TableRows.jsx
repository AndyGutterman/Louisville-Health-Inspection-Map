// Table View's rows: cards on phones (TableCards), a sortable grid elsewhere (TableGrid).
import { scoreBand } from "@lfs/core/grading.js";
import { useT } from "../../I18nContext.jsx";
import { regionShort } from "./tableRegions.js";

// Bullitt's latest inspection is undated when it comes from the county's sheet (lib/bullitt.js).
function fmt(val, region, t, locale) {
  if (!val) return region === "bullitt" ? t("table.notPublished") : "—";
  const m = String(val).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(val);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString(locale, {
    timeZone: "UTC",
  });
}

const rowKey = (row) => `${row.region}-${row.inspection_id}`;

export function TableCards({ rows, loading, error, openRow }) {
  const { t, locale } = useT();
  return (
    <ul className="tbl-cards" aria-label={t("table.inspections")}>
      {loading && (
        <li className="tbl-loading">
          <span className="tbl-spinner" /> {t("table.loading")}
        </li>
      )}
      {!loading &&
        rows.map((row) => (
          <li key={rowKey(row)}>
            <button
              type="button"
              className="tbl-card"
              data-testid="table-row"
              onClick={() => openRow(row)}
            >
              <span className={`tbl-score-badge ${scoreBand(row.score)}`}>
                {row.score || t("table.na")}
              </span>
              <span className="tbl-card-main">
                <span className="tbl-name">{row.name || t("table.unknown")}</span>
                <span className="tbl-addr">
                  {[row.address, row.city].filter(Boolean).join(", ") || "—"}
                </span>
                <span className="tbl-card-meta">
                  {row.ins_type_desc || "—"} · {fmt(row.inspection_date, row.region, t, locale)}
                  {row.grade?.trim()
                    ? ` · ${t("table.gradeLabel", { grade: row.grade.trim() })}`
                    : ""}
                  {row.region === "bullitt" && (
                    <span className="tbl-county-tag">{regionShort(row.region)}</span>
                  )}
                </span>
              </span>
            </button>
          </li>
        ))}
      {!loading && !error && rows.length === 0 && (
        <li className="tbl-empty">{t("table.noResults")}</li>
      )}
    </ul>
  );
}

// sort: useTableSort(). The Score, Place and Date headers sort by that column.
export function TableGrid({ rows, loading, error, openRow, sort, onRowHover, onRowHoverEnd }) {
  const { t, locale } = useT();
  const { sortAxis, sortDir, handleScoreSort, handleNameSort, handleDateSort } = sort;
  return (
    <table className="table-grid" style={{ minWidth: 560 }}>
      <thead>
        <tr>
          <th className={sortAxis === "score" ? "sorted" : ""} onClick={handleScoreSort}>
            {t("table.col.score")}{" "}
            <span className="sort-icon">
              {sortAxis === "score" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
            </span>
          </th>
          <th className="tbl-col-type">{t("table.col.type")}</th>
          <th
            className={sortAxis === "name" ? "sorted" : ""}
            onClick={handleNameSort}
            style={{ cursor: "pointer" }}
          >
            {t("table.col.place")}{" "}
            <span className="sort-icon">
              {sortAxis === "name" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
            </span>
          </th>
          <th className="tbl-col-addr">{t("table.col.address")}</th>
          <th className="tbl-col-zip">{t("table.col.zip")}</th>
          <th className={sortAxis === "date" ? "sorted" : ""} onClick={handleDateSort}>
            {t("table.col.date")}{" "}
            <span className="sort-icon">
              {sortAxis === "date" ? (sortDir === "desc" ? "↓" : "↑") : "↕"}
            </span>
          </th>
          <th className="tbl-col-grade">{t("table.col.grade")}</th>
        </tr>
      </thead>
      <tbody>
        {loading && (
          <tr>
            <td colSpan={7} className="tbl-loading">
              <span className="tbl-spinner" /> {t("table.loading")}
            </td>
          </tr>
        )}
        {!loading &&
          rows.map((row) => {
            const gradeDisp = row.grade?.trim() || "—";
            return (
              <tr
                key={rowKey(row)}
                className="tbl-row"
                data-testid="table-row"
                // Reachable with Tab and opened with Enter or Space, like the phone's cards.
                tabIndex={0}
                aria-label={t("table.openDetails", {
                  name: row.name || t("table.unknown"),
                  address: row.address || "",
                })}
                onPointerEnter={() => onRowHover?.(row.establishment_id, row)}
                onPointerLeave={() => onRowHoverEnd?.()}
                onFocus={() => onRowHover?.(row.establishment_id, row)}
                onBlur={() => onRowHoverEnd?.()}
                onClick={() => openRow(row)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  openRow(row);
                }}
              >
                <td>
                  <span className={`tbl-score-badge ${scoreBand(row.score)}`}>
                    {row.score || t("table.na")}
                  </span>
                </td>
                <td className="tbl-col-type">
                  <div className="tbl-type">{row.ins_type_desc || "—"}</div>
                </td>
                <td>
                  <div className="tbl-name">{row.name || t("table.unknown")}</div>
                </td>
                <td className="tbl-col-addr">
                  <div className="tbl-addr">
                    {row.address || "—"}
                    {row.region === "bullitt" && row.city ? `, ${row.city}` : ""}
                  </div>
                </td>
                <td className="tbl-col-zip">
                  <div className="tbl-zip">{row.zip || "—"}</div>
                </td>
                <td className="tbl-col-date">{fmt(row.inspection_date, row.region, t, locale)}</td>
                <td className="tbl-col-grade">
                  <span className={`tbl-grade ${gradeDisp === "—" ? "muted" : ""}`}>
                    {gradeDisp}
                  </span>
                </td>
              </tr>
            );
          })}
        {!loading && !error && rows.length === 0 && (
          <tr>
            <td colSpan={7} className="tbl-empty">
              {t("table.noResults")}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
