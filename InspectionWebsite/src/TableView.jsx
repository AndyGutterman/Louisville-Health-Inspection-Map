import React, { useState, useRef, useEffect, useCallback } from "react";

const PAGE_SIZES = [10, 25, 50, 100];
const SORT_OPTIONS = [
  { value: "date_desc",  label: "Most recent"  },
  { value: "score_asc",  label: "Worst first"  },
  { value: "score_desc", label: "Best first"   },
  { value: "date_asc",   label: "Oldest first" },
];

function scoreClass(s) {
  if (s == null || s === 0) return "na";
  if (s >= 95) return "ok";
  if (s >= 85) return "warn";
  return "bad";
}

function fmt(val) {
  if (!val) return "—";
  const m = String(val).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(val);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
    .toLocaleDateString(undefined, { timeZone: "UTC" });
}

/* vertical drag (height) */
const MIN_H = 180, MAX_H_FRAC = 0.88;
function useDragH(frac = 0.50) {
  const [h, setH] = useState(() => Math.round(window.innerHeight * frac));
  const d = useRef({});
  const down = useCallback(e => {
    d.current = { on: true, y0: e.clientY, h0: h };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [h]);
  const move = useCallback(e => {
    if (!d.current.on) return;
    setH(Math.max(MIN_H, Math.min(window.innerHeight * MAX_H_FRAC,
      d.current.h0 + d.current.y0 - e.clientY)));
  }, []);
  const up = useCallback(() => { d.current.on = false; }, []);
  return { h, downH: down, moveH: move, upH: up };
}

/* horizontal drag (width) */
const MIN_W = 320;
function useDragW(defaultFrac = 0.58) {
  const [w, setW] = useState(() => Math.round(window.innerWidth * defaultFrac));
  const d = useRef({});
  const down = useCallback(e => {
    d.current = { on: true, x0: e.clientX, w0: w };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [w]);
  const move = useCallback(e => {
    if (!d.current.on) return;
    setW(Math.max(MIN_W, Math.min(window.innerWidth - 16,
      d.current.w0 + (e.clientX - d.current.x0))));
  }, []);
  const up = useCallback(() => { d.current.on = false; }, []);
  return { w, downW: down, moveW: move, upW: up };
}

export default function TableView({ supabase, onRowClick, onClose }) {
  const [rows,       setRows]       = useState([]);
  const [total,      setTotal]      = useState(0);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);

  const [page,       setPage]       = useState(1);
  const [pageSize,   setPageSize]   = useState(25);
  const [sort,       setSort]       = useState("date_desc");

  const [search,     setSearch]     = useState("");
  const [dbSearch,   setDbSearch]   = useState("");

  const [types,      setTypes]      = useState([]);
  const [selType,    setSelType]    = useState("REGULAR");
  const [latestOnly, setLatestOnly] = useState(true);
  const [hideNA,     setHideNA]     = useState(false);

  const { h, downH, moveH, upH } = useDragH();
  const { w, downW, moveW, upW } = useDragW();
  const bodyRef = useRef(null);

  const onPanelMove   = useCallback(e => { moveH(e); moveW(e); }, [moveH, moveW]);
  const onPanelUp     = useCallback(e => { upH(e);   upW(e);   }, [upH, upW]);

  useEffect(() => {
    const t = setTimeout(() => setDbSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [sort, dbSearch, selType, latestOnly, pageSize, hideNA]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [page]);

  useEffect(() => {
    if (!supabase) return;
    supabase.from("v_inspection_types").select("ins_type_desc, cnt")
      .then(({ data, error }) => {
        if (error) { console.warn("v_inspection_types:", error.message); return; }
        setTypes((data || []).map(r => ({ type: r.ins_type_desc, count: Number(r.cnt) })));
      });
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const view = latestOnly ? "v_latest_insp_per_type" : "v_inspection_table";
    const from = (page - 1) * pageSize;
    const to   = from + pageSize - 1;
    const col  = sort.startsWith("score") ? "score" : "inspection_date";
    const asc  = sort.endsWith("asc");

    let q = supabase
      .from(view)
      .select("inspection_id, establishment_id, inspection_date, score, grade, ins_type_desc, name, address, zip", { count: "exact" })
      .order(col, { ascending: asc, nullsFirst: false })
      .range(from, to);

    if (hideNA)   q = q.gt("score", 0);
    if (selType)  q = q.eq("ins_type_desc", selType);
    if (dbSearch) q = q.or(`name.ilike.%${dbSearch}%,address.ilike.%${dbSearch}%,zip.ilike.%${dbSearch}%`);

    q.then(({ data, error, count }) => {
      if (cancelled) return;
      if (error) { setError(error.message); setLoading(false); return; }
      setRows(data || []);
      setTotal(count ?? 0);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [supabase, page, pageSize, sort, dbSearch, selType, latestOnly, hideNA]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage   = Math.min(page, totalPages);
  const startRow   = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endRow     = Math.min(safePage * pageSize, total);

  const pageButtons = (() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const s = new Set([1, totalPages, safePage, safePage - 1, safePage + 1].filter(p => p >= 1 && p <= totalPages));
    const arr = [...s].sort((a, b) => a - b);
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      if (i > 0 && arr[i] - arr[i - 1] > 1) out.push("…");
      out.push(arr[i]);
    }
    return out;
  })();

  const sortArrow = (asc, desc) =>
    sort === asc ? "↑" : sort === desc ? "↓" : "↕";

  return (
    <div
      className="table-panel"
      style={{ height: h, width: w }}
      onPointerMove={onPanelMove}
      onPointerUp={onPanelUp}
      onPointerCancel={onPanelUp}
    >
      {/* top drag (height) */}
      <div className="table-drag-zone" onPointerDown={downH}>
        <div className="table-drag-handle" />
      </div>

      {/* right drag (width) */}
      <div className="table-drag-right" onPointerDown={downW} />

      {/* header */}
      <div className="table-panel-header">
        <span className="table-panel-title">Inspection Scores</span>
        <button className="table-panel-close" onClick={onClose}>✕</button>
      </div>

      {/* toolbar */}
      <div className="table-toolbar">
        <div className="table-search">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2.5">
            <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input type="text" placeholder="Search name, address, or zip…"
                 value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="table-sort-select-wrap">
          <svg className="table-sort-icon" width="12" height="12" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M3 6h18M7 12h10M11 18h2"/>
          </svg>
          <select className="table-sort-select" value={sort}
                  onChange={e => setSort(e.target.value)}>
            {SORT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <svg className="table-sort-caret" width="9" height="9" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </div>
      </div>

      {/* type chips */}
      {types.length > 0 && (
        <div className="table-type-row">
          <div className="table-type-chips">
            <button className={`table-chip ${!selType ? "active" : ""}`}
                    onClick={() => setSelType(null)}>All</button>
            {types.map(t => (
              <button key={t.type}
                      className={`table-chip ${selType === t.type ? "active" : ""}`}
                      onClick={() => setSelType(selType === t.type ? null : t.type)}
                      title={`${t.count.toLocaleString()} inspections`}>
                {t.type}
              </button>
            ))}
          </div>
          <label className="table-latest-toggle" title="Most recent inspection per type per facility">
            <input type="checkbox" checked={latestOnly}
                   onChange={e => setLatestOnly(e.target.checked)} />
            <span>Latest</span>
          </label>
          <label className="table-latest-toggle" title="Hide rows with no numerical score">
            <input type="checkbox" checked={hideNA}
                   onChange={e => setHideNA(e.target.checked)} />
            <span>Hide N/A</span>
          </label>
        </div>
      )}

      {/* table */}
      <div className="table-body" ref={bodyRef}>
        {error && (
          <div className="tbl-error">
            ⚠ {error}
            <br/><small>Re-run supabase_table_views.sql to create missing views.</small>
          </div>
        )}
        <table className="table-grid">
          <thead>
            <tr>
              <th onClick={() => setSort(sort === "score_asc" ? "score_desc" : "score_asc")}>
                Score <span className="sort-icon">{sortArrow("score_asc", "score_desc")}</span>
              </th>
              <th className="tbl-col-type">Type</th>
              <th>Place</th>
              <th className="tbl-col-addr">Address</th>
              <th className="tbl-col-zip">Zip</th>
              <th onClick={() => setSort(sort === "date_desc" ? "date_asc" : "date_desc")}>
                Date <span className="sort-icon">{sortArrow("date_asc", "date_desc")}</span>
              </th>
              <th className="tbl-col-grade">Grade</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="tbl-loading">
                <span className="tbl-spinner" /> Loading…
              </td></tr>
            )}
            {!loading && rows.map(row => {
              const cls       = scoreClass(row.score);
              const scoreText = row.score || "N/A";
              const gradeDisp = row.grade?.trim() || "—";
              return (
                <tr key={row.inspection_id} className="tbl-row"
                    onClick={() => onRowClick?.({
                      establishment_id: row.establishment_id,
                      name:    row.name,
                      address: row.address,
                      date:    row.inspection_date,
                      score:   row.score,
                      grade:   row.grade,
                    })}>
                  <td><span className={`tbl-score-badge ${cls}`}>{scoreText}</span></td>
                  <td className="tbl-col-type"><div className="tbl-type">{row.ins_type_desc || "—"}</div></td>
                  <td><div className="tbl-name">{row.name || "Unknown"}</div></td>
                  <td className="tbl-col-addr"><div className="tbl-addr">{row.address || "—"}</div></td>
                  <td className="tbl-col-zip"><div className="tbl-zip">{row.zip || "—"}</div></td>
                  <td className="tbl-col-date">{fmt(row.inspection_date)}</td>
                  <td className="tbl-col-grade">
                    <span className={`tbl-grade ${gradeDisp === "—" ? "muted" : ""}`}>{gradeDisp}</span>
                  </td>
                </tr>
              );
            })}
            {!loading && !error && rows.length === 0 && (
              <tr><td colSpan={7} className="tbl-empty">No results</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* footer */}
      <div className="table-footer">
        <span className="table-result-count">
          {total === 0 ? "No results" : `${startRow}–${endRow} of ${total.toLocaleString()}`}
        </span>
        <div className="table-page-size">
          <span>Per page</span>
          {PAGE_SIZES.map(n => (
            <button key={n} className={`tbl-size-btn ${pageSize === n ? "active" : ""}`}
                    onClick={() => setPageSize(n)}>{n}</button>
          ))}
        </div>
        <div className="table-pagination">
          <button className="tbl-pg-btn" disabled={safePage === 1}
                  onClick={() => setPage(p => p - 1)}>‹</button>
          {pageButtons.map((p, i) =>
            p === "…"
              ? <span key={`e${i}`} className="tbl-pg-ellipsis">…</span>
              : <button key={p} className={`tbl-pg-btn ${safePage === p ? "active" : ""}`}
                        onClick={() => setPage(p)}>{p}</button>
          )}
          <button className="tbl-pg-btn" disabled={safePage === totalPages}
                  onClick={() => setPage(p => p + 1)}>›</button>
        </div>
      </div>
    </div>
  );
}