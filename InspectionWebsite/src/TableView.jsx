import React, { useState, useRef, useEffect, useCallback } from "react";

const PAGE_SIZES = [10, 25, 50, 100, 500];

// The two sort axes, each togglable
// dateSort: "desc" = newest first, "asc" = oldest first
// scoreSort: "asc" = lowest first, "desc" = highest first
// activeAxis: "date" | "score"

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

/* ── drag: height ── */
const MIN_H = 180, MAX_H_FRAC = 0.88;
function useDragH() {
  const defaultH = () => Math.round(window.innerHeight * (window.innerWidth <= 600 ? 0.42 : 0.50));
  const [h, setH] = useState(defaultH);
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
  return { h, setH, downH: down, moveH: move, upH: up };
}

/* ── drag: width ── */
const MIN_W = 320;
function useDragW() {
  const defaultW = () => {
    const vw = window.innerWidth;
    if (vw <= 600) return vw;
    return Math.max(MIN_W, Math.min(vw * 0.54, vw - 556));
  };
  const [w, setW] = useState(defaultW);
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
  return { w, setW, downW: down, moveW: move, upW: up };
}

/* ── diagonal corner drag ── */
function useCornerDrag(setH, setW) {
  const d = useRef({});
  const down = useCallback((e, curH, curW) => {
    e.preventDefault();
    d.current = { on: true, x0: e.clientX, y0: e.clientY, h0: curH, w0: curW };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);
  const move = useCallback(e => {
    if (!d.current.on) return;
    const dx = e.clientX - d.current.x0;
    const dy = e.clientY - d.current.y0; // positive = dragging down = shrink height
    setW(w => Math.max(MIN_W, Math.min(window.innerWidth - 16, d.current.w0 + dx)));
    setH(h => Math.max(MIN_H, Math.min(window.innerHeight * MAX_H_FRAC, d.current.h0 - dy)));
  }, [setH, setW]);
  const up = useCallback(() => { d.current.on = false; }, []);
  return { downCorner: down, moveCorner: move, upCorner: up };
}

// Facility category definitions (mirrors Map.jsx CATEGORY_SPECS)
const FACILITY_CATS = {
  restaurants:         { label: "Restaurants",        pairs: [[605, 11]] },
  schools:             { label: "Schools",             pairs: [[605, 33]] },
  daycare:             { label: "Daycare",             pairs: [[605, 31]] },
  hospitals:           { label: "Healthcare",          pairs: [[605, 32]] },
  concessions:         { label: "Concessions",         pairs: [[603, 51],[603, 53]] },
  caterers_commissary: { label: "Kitchens",            pairs: [[605, 42],[605, 43]] },
  retail:              { label: "Retail",              pairs: [[610, 61],[610, 62],[610, 63],[610, 64],[610, 65],[610, 73],[610, 212],[607, 54],[607, 55],[605, 54]] },
  unknown:             { label: "Other",               pairs: [[605, 36],[604, 16],[605, 52]] },
};

export default function TableView({ supabase, onRowClick, onClose }) {
  const [rows,    setRows]    = useState([]);
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Sort state: axis = "date"|"score", dir = "desc"|"asc"
  const [sortAxis, setSortAxis] = useState("date");
  const [sortDir,  setSortDir]  = useState("desc");

  const [search,   setSearch]   = useState("");
  const [dbSearch, setDbSearch] = useState("");

  // Inspection type chips (multiselect)
  const [types,    setTypes]    = useState([]);
  const [selTypes, setSelTypes] = useState(null); // null = All

  // Facility category chips (multiselect)
  const [selCats, setSelCats] = useState(null); // null = All

  const [latestOnly, setLatestOnly] = useState(true);
  const [hideNA,     setHideNA]     = useState(false);

  const { h, setH, downH, moveH, upH } = useDragH();
  const { w, setW, downW, moveW, upW } = useDragW();
  const { downCorner, moveCorner, upCorner } = useCornerDrag(setH, setW);
  const bodyRef = useRef(null);
  const cornerRef = useRef(null);

  // Unified pointer move/up for all drag handles
  const onPanelMove = useCallback(e => { moveH(e); moveW(e); moveCorner(e); }, [moveH, moveW, moveCorner]);
  const onPanelUp   = useCallback(e => { upH(e); upW(e); upCorner(e); }, [upH, upW, upCorner]);

  useEffect(() => {
    const t = setTimeout(() => setDbSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [sortAxis, sortDir, dbSearch, selTypes, selCats, latestOnly, pageSize, hideNA]);

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

  // Derive active inspection types for query
  const activeTypes = selTypes === null ? null
    : selTypes.size === 0 ? null
    : [...selTypes];

  // Derive facility ft:st pairs for category filter
  const activeCatPairs = selCats === null ? null
    : selCats.size === 0 ? null
    : [...selCats].flatMap(k => FACILITY_CATS[k]?.pairs ?? []);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const view = latestOnly ? "v_latest_insp_per_type" : "v_inspection_table";
    const from = (page - 1) * pageSize;
    const to   = from + pageSize - 1;
    const col  = sortAxis === "score" ? "score" : "inspection_date";
    const asc  = sortDir === "asc";

    // We need facility_type + subtype if category filter is active
    const selectCols = activeCatPairs
      ? "inspection_id, establishment_id, inspection_date, score, grade, ins_type_desc, name, address, zip, facility_type, subtype"
      : "inspection_id, establishment_id, inspection_date, score, grade, ins_type_desc, name, address, zip";

    let q = supabase
      .from(view)
      .select(selectCols, { count: "exact" })
      .order(col, { ascending: asc, nullsFirst: false })
      .range(from, to);

    if (hideNA)      q = q.gt("score", 0);
    if (activeTypes) q = q.in("ins_type_desc", activeTypes);
    if (dbSearch)    q = q.or(`name.ilike.%${dbSearch}%,address.ilike.%${dbSearch}%,zip.ilike.%${dbSearch}%`);

    // Category filter: filter by facility_type+subtype pairs
    if (activeCatPairs && activeCatPairs.length > 0) {
      const orClauses = activeCatPairs
        .map(([ft, st]) => `and(facility_type.eq.${ft},subtype.eq.${st})`)
        .join(",");
      q = q.or(orClauses);
    }

    q.then(({ data, error, count }) => {
      if (cancelled) return;
      if (error) { setError(error.message); setLoading(false); return; }
      setRows(data || []);
      setTotal(count ?? 0);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [supabase, page, pageSize, sortAxis, sortDir, dbSearch, selTypes, selCats, latestOnly, hideNA]);

  /* ── type chip toggle ── */
  const toggleType = (name) => {
    setSelTypes(prev => {
      if (prev === null) return new Set([name]);
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      if (next.size === 0) return null;
      if (types.length > 0 && next.size === types.length) return null;
      return next;
    });
  };

  /* ── facility cat toggle ── */
  const toggleCat = (key) => {
    setSelCats(prev => {
      if (prev === null) return new Set([key]);
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      if (next.size === 0) return null;
      if (next.size === Object.keys(FACILITY_CATS).length) return null;
      return next;
    });
  };

  /* ── sort toggle buttons ── */
  const handleDateSort = () => {
    if (sortAxis !== "date") { setSortAxis("date"); setSortDir("desc"); }
    else setSortDir(d => d === "desc" ? "asc" : "desc");
  };
  const handleScoreSort = () => {
    if (sortAxis !== "score") { setSortAxis("score"); setSortDir("asc"); }
    else setSortDir(d => d === "asc" ? "desc" : "asc");
  };

  const dateSortLabel  = sortAxis === "date"
    ? (sortDir === "desc" ? "Newest ↓" : "Oldest ↑")
    : "Date";
  const scoreSortLabel = sortAxis === "score"
    ? (sortDir === "asc" ? "Lowest ↑" : "Highest ↓")
    : "Score";

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage   = Math.min(page, totalPages);
  const startRow   = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endRow     = Math.min(safePage * pageSize, total);

  const pageButtons = (() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const s = new Set([1, totalPages, safePage, safePage - 1, safePage + 1]
      .filter(p => p >= 1 && p <= totalPages));
    const arr = [...s].sort((a, b) => a - b);
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      if (i > 0 && arr[i] - arr[i - 1] > 1) out.push("…");
      out.push(arr[i]);
    }
    return out;
  })();

  const isAllTypes = selTypes === null;
  const isAllCats  = selCats === null;

  return (
    <div
      className="table-panel"
      style={{ height: h, width: w }}
      onPointerMove={onPanelMove}
      onPointerUp={onPanelUp}
      onPointerCancel={onPanelUp}
    >
      {/* ── top drag handle (height) ── */}
      <div className="table-drag-zone" onPointerDown={downH}>
        <div className="table-drag-handle" />
      </div>

      {/* ── right drag handle (width) ── */}
      <div className="table-drag-right" onPointerDown={downW} />

      {/* ── corner drag handle (diagonal) ── */}
      <div
        className="table-drag-corner"
        onPointerDown={e => downCorner(e, h, w)}
      />

      {/* ── header ── */}
      <div className="table-panel-header">
        <span className="table-panel-title">Inspection Scores</span>
        <button className="table-panel-close" onClick={onClose}>✕</button>
      </div>

      {/* ── toolbar: search + toggles + sort pills ── */}
      <div className="table-toolbar">
        {/* Search — grows to fill available space */}
        <div className="table-search">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2.5">
            <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="Search name, address, zip…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Toggle pills — same visual style */}
        <button
          className={`tbl-pill-btn ${latestOnly ? "active" : ""}`}
          title="Show only the most recent inspection per inspection type per facility"
          onClick={() => setLatestOnly(v => !v)}
        >
          Unique
        </button>
        <button
          className={`tbl-pill-btn ${hideNA ? "active" : ""}`}
          title="Hide rows with no numerical score"
          onClick={() => setHideNA(v => !v)}
        >
          Hide N/A
        </button>

        {/* Sort switch — two linked pills */}
        <div className="tbl-sort-switch" role="group" aria-label="Sort">
          <button
            className={`tbl-sort-pill ${sortAxis === "date" ? "active" : ""}`}
            onClick={handleDateSort}
            title="Sort by date — click again to flip"
          >
            {dateSortLabel}
          </button>
          <button
            className={`tbl-sort-pill ${sortAxis === "score" ? "active" : ""}`}
            onClick={handleScoreSort}
            title="Sort by score — click again to flip"
          >
            {scoreSortLabel}
          </button>
        </div>
      </div>

      {/* ── Inspection type chips ── */}
      {types.length > 0 && (
        <div className="table-filter-row">
          <span className="table-filter-label">Type</span>
          <div className="table-type-chips">
            <button
              className={`table-chip ${isAllTypes ? "active" : ""}`}
              onClick={() => setSelTypes(null)}
            >All</button>
            {types.map(t => (
              <button
                key={t.type}
                className={`table-chip ${selTypes !== null && selTypes.has(t.type) ? "active" : ""}`}
                onClick={() => toggleType(t.type)}
                title={`${t.count.toLocaleString()} inspections`}
              >{t.type}</button>
            ))}
          </div>
        </div>
      )}

      {/* ── Facility category chips ── */}
      <div className="table-filter-row">
        <span className="table-filter-label">Facility</span>
        <div className="table-type-chips">
          <button
            className={`table-chip ${isAllCats ? "active" : ""}`}
            onClick={() => setSelCats(null)}
          >All</button>
          {Object.entries(FACILITY_CATS).map(([key, spec]) => (
            <button
              key={key}
              className={`table-chip ${selCats !== null && selCats.has(key) ? "active" : ""}`}
              onClick={() => toggleCat(key)}
            >{spec.label}</button>
          ))}
        </div>
      </div>

      {/* ── Table body ── */}
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
              <th
                className={sortAxis === "score" ? "sorted" : ""}
                onClick={handleScoreSort}
              >
                Score <span className="sort-icon">{sortAxis === "score" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}</span>
              </th>
              <th className="tbl-col-type">Type</th>
              <th>Place</th>
              <th className="tbl-col-addr">Address</th>
              <th className="tbl-col-zip">Zip</th>
              <th
                className={sortAxis === "date" ? "sorted" : ""}
                onClick={handleDateSort}
              >
                Date <span className="sort-icon">{sortAxis === "date" ? (sortDir === "desc" ? "↓" : "↑") : "↕"}</span>
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

      {/* ── footer ── */}
      <div className="table-footer">
        <span className="table-result-count">
          {total === 0 ? "No results" : `${startRow}–${endRow} of ${total.toLocaleString()}`}
        </span>
        <div className="table-page-size">
          <span>Per page</span>
          {PAGE_SIZES.map(n => (
            <button
              key={n}
              className={`tbl-size-btn ${pageSize === n ? "active" : ""}`}
              onClick={() => setPageSize(n)}
            >{n}</button>
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