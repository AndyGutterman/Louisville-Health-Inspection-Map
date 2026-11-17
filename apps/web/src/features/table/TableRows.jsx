// Table View's rows: cards on phones (TableCards), a sortable grid elsewhere (TableGrid).
import { scoreBand } from "@lfs/core/grading.js";
import { regionShort } from "./tableRegions.js";

// Bullitt's latest inspection is undated when it comes from the county's sheet (lib/bullitt.js).
function fmt(val, region) {
  if (!val) return region === "bullitt" ? "Not published" : "—";
  const m = String(val).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(val);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString(undefined, {
    timeZone: "UTC",
  });
}

const rowKey = (row) => `${row.region}-${row.inspection_id}`;

export function TableCards({ rows, loading, error, openRow }) {
  return (
    <ul className="tbl-cards" aria-label="Inspections">
      {loading && (
        <li className="tbl-loading">
          <span className="tbl-spinner" /> Loading…
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
                {row.score || "N/A"}
              </span>
              <span className="tbl-card-main">
                <span className="tbl-name">{row.name || "Unknown"}</span>
                <span className="tbl-addr">
                  {[row.address, row.city].filter(Boolean).join(", ") || "—"}
                </span>
                <span className="tbl-card-meta">
                  {row.ins_type_desc || "—"} · {fmt(row.inspection_date, row.region)}
                  {row.grade?.trim() ? ` · Grade ${row.grade.trim()}` : ""}
                  {row.region === "bullitt" && (
                    <span className="tbl-county-tag">{regionShort(row.region)}</span>
                  )}
                </span>
              </span>
            </button>
          </li>
        ))}
      {!loading && !error && rows.length === 0 && <li className="tbl-empty">No results</li>}
    </ul>
  );
}

// sort: useTableSort(). The Score, Place and Date headers sort by that column.
export function TableGrid({ rows, loading, error, openRow, sort, onRowHover, onRowHoverEnd }) {
  const { sortAxis, sortDir, handleScoreSort, handleNameSort, handleDateSort } = sort;
  return (
    <table className="table-grid" style={{ minWidth: 560 }}>
      <thead>
        <tr>
          <th className={sortAxis === "score" ? "sorted" : ""} onClick={handleScoreSort}>
            Score{" "}
            <span className="sort-icon">
              {sortAxis === "score" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
            </span>
          </th>
          <th className="tbl-col-type">Type</th>
          <th
            className={sortAxis === "name" ? "sorted" : ""}
            onClick={handleNameSort}
            style={{ cursor: "pointer" }}
          >
            Place{" "}
            <span className="sort-icon">
              {sortAxis === "name" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
            </span>
          </th>
          <th className="tbl-col-addr">Address</th>
          <th className="tbl-col-zip">Zip</th>
          <th className={sortAxis === "date" ? "sorted" : ""} onClick={handleDateSort}>
            Date{" "}
            <span className="sort-icon">
              {sortAxis === "date" ? (sortDir === "desc" ? "↓" : "↑") : "↕"}
            </span>
          </th>
          <th className="tbl-col-grade">Grade</th>
        </tr>
      </thead>
      <tbody>
        {loading && (
          <tr>
            <td colSpan={7} className="tbl-loading">
              <span className="tbl-spinner" /> Loading…
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
                onPointerEnter={() => onRowHover?.(row.establishment_id, row)}
                onPointerLeave={() => onRowHoverEnd?.()}
                onClick={() => openRow(row)}
              >
                <td>
                  <span className={`tbl-score-badge ${scoreBand(row.score)}`}>
                    {row.score || "N/A"}
                  </span>
                </td>
                <td className="tbl-col-type">
                  <div className="tbl-type">{row.ins_type_desc || "—"}</div>
                </td>
                <td>
                  <div className="tbl-name">{row.name || "Unknown"}</div>
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
                <td className="tbl-col-date">{fmt(row.inspection_date, row.region)}</td>
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
              No results
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
