// Table View: every inspection in both counties, searchable and sortable, read a page at
// a time from v_table_latest / v_table_inspections. On phones the filters fold away and
// rows become cards, so the list gets the room.
import React, { useState, useRef, useEffect, useCallback } from "react";
import { useMediaQuery } from "./hooks/useMediaQuery.js";
import { enabledRegions } from "./lib/regions.js";
import {
  FACILITY_CATS,
  FACILITY_CAT_KEYS,
  combineOr,
  countKey,
  countyForFacility,
  facilityAppliesTo,
  facilityFilter,
  searchFilters,
  typedCounties,
} from "./lib/tableQuery.js";

const PAGE_SIZES = [10, 25, 50, 100, 500];

function scoreClass(s) {
  if (s == null || s === 0) return "na";
  if (s >= 95) return "ok";
  if (s >= 85) return "warn";
  return "bad";
}

// Bullitt County publishes no date for the latest inspection (lib/bullitt.js).
function fmt(val, region) {
  if (!val) return region === "bullitt" ? "Not published" : "—";
  const m = String(val).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(val);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString(undefined, {
    timeZone: "UTC",
  });
}

/* ── drag: height ── */
const MIN_H = 180,
  MAX_H_FRAC = 0.88;
function useDragH(savedH) {
  const defaultH = () =>
    savedH != null
      ? savedH
      : Math.round(window.innerHeight * (window.innerWidth <= 600 ? 0.58 : 0.5));
  const [h, setH] = useState(defaultH);
  const d = useRef({});
  // Top edge: drag up = taller (y decreases)
  const down = useCallback(
    (e) => {
      d.current = { on: true, dir: "top", y0: e.clientY, h0: h };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [h],
  );
  // Bottom edge: drag down = taller (y increases)
  const downBottom = useCallback(
    (e) => {
      d.current = { on: true, dir: "bottom", y0: e.clientY, h0: h };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [h],
  );
  const move = useCallback((e) => {
    if (!d.current.on) return;
    const delta =
      d.current.dir === "bottom"
        ? e.clientY - d.current.y0 // drag down = bigger
        : d.current.y0 - e.clientY; // drag up   = bigger
    setH(Math.max(MIN_H, Math.min(window.innerHeight * MAX_H_FRAC, d.current.h0 + delta)));
  }, []);
  const up = useCallback(() => {
    d.current.on = false;
  }, []);
  return { h, setH, downH: down, downHBottom: downBottom, moveH: move, upH: up };
}

/* ── drag: width ── */
const MIN_W = 320;
function useDragW(savedW) {
  const defaultW = () => {
    if (savedW != null) return savedW;
    const vw = window.innerWidth;
    if (vw <= 600) return vw;
    return Math.max(MIN_W, Math.min(vw * 0.54, vw - 556));
  };
  const [w, setW] = useState(defaultW);
  const d = useRef({});
  const down = useCallback(
    (e) => {
      d.current = { on: true, x0: e.clientX, w0: w };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [w],
  );
  const move = useCallback((e) => {
    if (!d.current.on) return;
    setW(
      Math.max(MIN_W, Math.min(window.innerWidth - 16, d.current.w0 + (e.clientX - d.current.x0))),
    );
  }, []);
  const up = useCallback(() => {
    d.current.on = false;
  }, []);
  return { w, setW, downW: down, moveW: move, upW: up };
}

/* ── drag: corner (diagonal) ── */
function useCornerDrag(setH, setW) {
  const d = useRef({});
  const down = useCallback((e, curH, curW) => {
    e.preventDefault();
    d.current = { on: true, x0: e.clientX, y0: e.clientY, h0: curH, w0: curW };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);
  const move = useCallback(
    (e) => {
      if (!d.current.on) return;
      const dx = e.clientX - d.current.x0;
      const dy = e.clientY - d.current.y0;
      setW(() => Math.max(MIN_W, Math.min(window.innerWidth - 16, d.current.w0 + dx)));
      setH(() => Math.max(MIN_H, Math.min(window.innerHeight * MAX_H_FRAC, d.current.h0 - dy)));
    },
    [setH, setW],
  );
  const up = useCallback(() => {
    d.current.on = false;
  }, []);
  return { downCorner: down, moveCorner: move, upCorner: up };
}

const REGIONS = enabledRegions();
const regionShort = (id) => REGIONS.find((r) => r.id === id)?.shortName ?? "";
const regionName = (id) => REGIONS.find((r) => r.id === id)?.name ?? "";

export default function TableView({
  supabase,
  onRowClick,
  onRowHover,
  onRowHoverEnd,
  onClose,
  savedH,
  savedW,
  onResize,
  hidden,
  zIndex,
  onBringToFront,
}) {
  const isPhone = useMediaQuery("(max-width: 600px)");
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Sort: axis = "date"|"score"|"name", dir = "desc"|"asc"
  const [sortAxis, setSortAxis] = useState("date");
  const [sortDir, setSortDir] = useState("desc");

  const [search, setSearch] = useState("");
  const [dbSearch, setDbSearch] = useState("");

  // Inspection type multiselect (null = All)
  const [types, setTypes] = useState([]);
  const [selTypes, setSelTypes] = useState(null);

  // Facility category multiselect (null = All)
  const [selCats, setSelCats] = useState(null);

  const [county, setCounty] = useState(null); // null = both counties
  const [latestOnly, setLatestOnly] = useState(true);
  const [hideNA, setHideNA] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false); // phones: the chip rows
  const activeFilters = (county ? 1 : 0) + (selTypes ? 1 : 0) + (selCats ? 1 : 0);

  const { h, setH, downH, downHBottom, moveH, upH } = useDragH(savedH);
  const { w, setW, downW, moveW, upW } = useDragW(savedW);
  const { downCorner, moveCorner, upCorner } = useCornerDrag(setH, setW);
  const bodyRef = useRef(null);
  // The filters the current `total` was counted for (lib/tableQuery.js countKey).
  const countedFor = useRef(null);

  // Notify parent of dimension changes so they survive close/reopen
  useEffect(() => {
    onResize?.(h, w);
  }, [h, w]);

  const onPanelMove = useCallback(
    (e) => {
      moveH(e);
      moveW(e);
      moveCorner(e);
    },
    [moveH, moveW, moveCorner],
  );
  const onPanelUp = useCallback(
    (e) => {
      upH(e);
      upW(e);
      upCorner(e);
    },
    [upH, upW, upCorner],
  );

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDbSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Reset page on filter/sort change
  useEffect(() => {
    setPage(1);
  }, [sortAxis, sortDir, dbSearch, selTypes, selCats, county, latestOnly, pageSize, hideNA]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [page]);

  // Fetch inspection type list once, the first time the table opens.
  const [typesWanted, setTypesWanted] = useState(false);
  useEffect(() => {
    if (!hidden) setTypesWanted(true);
  }, [hidden]);
  useEffect(() => {
    if (!supabase || !typesWanted) return;
    supabase
      .from("v_inspection_types")
      .select("ins_type_desc, cnt")
      .then(({ data, error }) => {
        if (error) {
          console.warn("v_inspection_types:", error.message);
          return;
        }
        setTypes((data || []).map((r) => ({ type: r.ins_type_desc, count: Number(r.cnt) })));
      });
  }, [supabase, typesWanted]);

  // Main data fetch. Nothing loads until the table is first opened, and the row count is
  // only asked for when the filters change, not on every page.
  useEffect(() => {
    if (!supabase || !typesWanted) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    const view = latestOnly ? "v_table_latest" : "v_table_inspections";
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const col = sortAxis === "score" ? "score" : sortAxis === "name" ? "name" : "inspection_date";
    const asc = sortDir === "asc";
    const key = countKey({
      view,
      region: county,
      hideNA,
      types: selTypes,
      cats: selCats,
      search: dbSearch,
    });
    const wantCount = countedFor.current !== key;

    let q = supabase
      .from(view)
      .select(
        "region, inspection_id, establishment_id, inspection_date, score, grade, ins_type_desc, name, address, city, zip",
        wantCount ? { count: "exact" } : undefined,
      )
      .order(col, { ascending: asc, nullsFirst: false })
      .order("inspection_id", { ascending: false })
      .range(from, to);

    if (county) q = q.eq("region", county);
    if (hideNA) q = q.gt("score", 0);
    if (selTypes) q = q.in("ins_type_desc", [...selTypes]);
    // Facility chips only cover counties with facility types (see toggleCat).
    const cats = facilityAppliesTo(county, REGIONS) ? selCats : null;
    if (cats && !county) q = q.in("region", typedCounties(REGIONS));
    const or = combineOr(...searchFilters(dbSearch), facilityFilter(cats));
    if (or) q = q.or(or);

    q.then(({ data, error, count }) => {
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      setRows(data || []);
      if (wantCount) {
        setTotal(count ?? 0);
        countedFor.current = key;
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [
    supabase,
    typesWanted,
    page,
    pageSize,
    sortAxis,
    sortDir,
    dbSearch,
    selTypes,
    selCats,
    county,
    latestOnly,
    hideNA,
  ]);

  /* ── chip toggle helpers ── */
  const toggleType = (name) => {
    setSelTypes((prev) => {
      if (prev === null) return new Set([name]);
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      if (next.size === 0 || (types.length > 0 && next.size === types.length)) return null;
      return next;
    });
  };

  // Facility types only exist in Jefferson's data (lib/regions.js), so picking a facility
  // with both counties shown switches the County chips to Jefferson, where it means
  // something, instead of silently dropping every Bullitt place.
  const toggleCat = (key) => {
    let next;
    if (selCats === null) next = new Set([key]);
    else {
      next = new Set(selCats);
      next.has(key) ? next.delete(key) : next.add(key);
      if (next.size === 0 || next.size === FACILITY_CAT_KEYS.length) next = null;
    }
    setSelCats(next);
    if (next) setCounty((c) => countyForFacility(c, REGIONS));
  };

  // Picking a county without facility types clears the facility filter.
  const pickCounty = (id) => {
    setCounty(id);
    if (!facilityAppliesTo(id, REGIONS)) setSelCats(null);
  };
  const facilityOn = facilityAppliesTo(county, REGIONS);

  /* ── sort toggle handlers ── */
  const handleDateSort = () => {
    if (sortAxis !== "date") {
      setSortAxis("date");
      setSortDir("desc");
    } else setSortDir((d) => (d === "desc" ? "asc" : "desc"));
  };
  const handleScoreSort = () => {
    if (sortAxis !== "score") {
      setSortAxis("score");
      setSortDir("asc");
    } else setSortDir((d) => (d === "asc" ? "desc" : "asc"));
  };
  const handleNameSort = () => {
    if (sortAxis !== "name") {
      setSortAxis("name");
      setSortDir("asc");
    } else setSortDir((d) => (d === "asc" ? "desc" : "asc"));
  };

  // Label always same width — use fixed strings with arrow suffix
  const dateSortLabel =
    sortAxis === "date" ? (sortDir === "desc" ? "Newest ↓" : "Oldest ↑") : "Newest ↓";
  const scoreSortLabel =
    sortAxis === "score" ? (sortDir === "asc" ? "Lowest ↑" : "Highest ↓") : "Lowest ↑";

  /* ── pagination ── */
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const startRow = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endRow = Math.min(safePage * pageSize, total);

  const pageButtons = (() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const s = new Set(
      [1, totalPages, safePage, safePage - 1, safePage + 1].filter(
        (p) => p >= 1 && p <= totalPages,
      ),
    );
    const arr = [...s].sort((a, b) => a - b);
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      if (i > 0 && arr[i] - arr[i - 1] > 1) out.push("…");
      out.push(arr[i]);
    }
    return out;
  })();

  const openRow = (row) =>
    onRowClick?.({
      establishment_id: row.establishment_id,
      name: row.name,
      address: row.address,
      date: row.inspection_date,
      score: row.score,
      grade: row.grade,
    });
  const rowKey = (row) => `${row.region}-${row.inspection_id}`;
  const showFilters = !isPhone || filtersOpen;

  return (
    <div
      className={`table-panel${isPhone ? " table-panel--phone" : ""}`}
      data-testid="table-panel"
      style={{ height: h, width: w, display: hidden ? "none" : undefined, zIndex: zIndex ?? 2900 }}
      onPointerDown={onBringToFront}
      onPointerMove={onPanelMove}
      onPointerUp={onPanelUp}
      onPointerCancel={onPanelUp}
    >
      {/* top edge resize handle — InfoDrawer-style gradient bar */}
      <div className="table-drag-top" onPointerDown={downH} />

      {/* right drag (width) */}
      <div className="table-drag-right" onPointerDown={downW} />

      {/* bottom edge resize handle — mirrors top */}
      <div className="table-drag-bottom" onPointerDown={downHBottom} />

      {/* corner drag bottom-right (diagonal) */}
      <div className="table-drag-corner" onPointerDown={(e) => downCorner(e, h, w)} />

      {/* corner drag top-right (diagonal) — more visible for new users */}
      <div className="table-drag-corner-tr" onPointerDown={(e) => downCorner(e, h, w)} />

      {/* header */}
      <div className="table-panel-header">
        <span className="table-panel-title">Inspection Scores</span>
        <button className="table-panel-close" onClick={onClose} aria-label="Close table view">
          ✕
        </button>
      </div>

      {/* toolbar */}
      <div className="table-toolbar">
        <div className="table-search">
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder={isPhone ? "Search both counties" : "Search name, address, city or zip"}
            aria-label="Search the table"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {isPhone && (
          <button
            className={`tbl-pill-btn ${filtersOpen || activeFilters ? "active" : ""}`}
            aria-expanded={filtersOpen}
            data-testid="table-filters-toggle"
            onClick={() => setFiltersOpen((v) => !v)}
          >
            Filters{activeFilters ? ` · ${activeFilters}` : ""}
          </button>
        )}

        <div className="tbl-toolbar-right">
          <button
            className={`tbl-pill-btn ${latestOnly ? "active" : ""}`}
            title="Show only the most recent inspection per type per facility"
            onClick={() => setLatestOnly((v) => !v)}
          >
            Unique
          </button>

          <button
            className={`tbl-pill-btn ${hideNA ? "active" : ""}`}
            title="Hide rows with no numerical score"
            onClick={() => setHideNA((v) => !v)}
          >
            Hide N/A
          </button>

          {/* Sort switch */}
          <div className="tbl-sort-switch" role="group" aria-label="Sort by">
            <button
              className={`tbl-sort-pill ${sortAxis === "date" ? "active" : ""}`}
              onClick={handleDateSort}
              title="Sort by date — click again to reverse"
            >
              {dateSortLabel}
            </button>
            <button
              className={`tbl-sort-pill ${sortAxis === "score" ? "active" : ""}`}
              onClick={handleScoreSort}
              title="Sort by score — click again to reverse"
            >
              {scoreSortLabel}
            </button>
          </div>
        </div>
      </div>

      {showFilters && (
        <div className="table-filters" data-testid="table-filters">
          {/* County chips */}
          <div className="table-filter-row">
            <span className="table-filter-label">County</span>
            <div className="table-type-chips">
              <button
                className={`table-chip ${county === null ? "active" : ""}`}
                onClick={() => pickCounty(null)}
              >
                Both
              </button>
              {REGIONS.map((r) => (
                <button
                  key={r.id}
                  data-testid={`table-county-${r.id}`}
                  className={`table-chip ${county === r.id ? "active" : ""}`}
                  onClick={() => pickCounty(county === r.id ? null : r.id)}
                  title={r.name}
                >
                  {r.shortName}
                </button>
              ))}
            </div>
          </div>

          {/* Inspection type chips */}
          {types.length > 0 && (
            <div className="table-filter-row">
              <span className="table-filter-label">Type</span>
              <div className="table-type-chips">
                <button
                  className={`table-chip ${selTypes === null ? "active" : ""}`}
                  onClick={() => setSelTypes(null)}
                >
                  All
                </button>
                {types.map((t) => (
                  <button
                    key={t.type}
                    className={`table-chip ${selTypes?.has(t.type) ? "active" : ""}`}
                    onClick={() => toggleType(t.type)}
                    title={`${t.count.toLocaleString()} inspections`}
                  >
                    {t.type}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Facility category chips: Jefferson only (its data is the one with types) */}
          <div className="table-filter-row">
            <span className="table-filter-label">Facility</span>
            {facilityOn ? (
              <div className="table-type-chips">
                <button
                  className={`table-chip ${selCats === null ? "active" : ""}`}
                  onClick={() => setSelCats(null)}
                >
                  All
                </button>
                {Object.entries(FACILITY_CATS).map(([key, spec]) => (
                  <button
                    key={key}
                    className={`table-chip ${selCats?.has(key) ? "active" : ""}`}
                    onClick={() => toggleCat(key)}
                    title="Jefferson County only: Bullitt's data has no facility types"
                  >
                    {spec.label}
                  </button>
                ))}
              </div>
            ) : (
              <span className="table-filter-note" data-testid="table-facility-note">
                {regionName(county)}&apos;s data has no facility types
              </span>
            )}
          </div>
        </div>
      )}

      {/* table */}
      <div className="table-body" ref={bodyRef}>
        {error && (
          <div className="tbl-error">
            ⚠ {error}
            <br />
            <small>
              Run supabase/migrations/20261111000000_both_counties.sql to create the table views.
            </small>
          </div>
        )}
        {isPhone ? (
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
                    <span className={`tbl-score-badge ${scoreClass(row.score)}`}>
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
        ) : (
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
                        <span className={`tbl-score-badge ${scoreClass(row.score)}`}>
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
        )}
      </div>

      {/* footer */}
      {isPhone ? (
        <div className="table-footer table-footer--phone">
          <span className="table-result-count">
            {total === 0 ? "No results" : `${startRow}–${endRow} of ${total.toLocaleString()}`}
          </span>
          <div className="table-pagination">
            <button
              className="tbl-pg-btn"
              aria-label="Previous page"
              disabled={safePage === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              ‹
            </button>
            <span className="tbl-pg-of">
              {safePage} / {totalPages.toLocaleString()}
            </span>
            <button
              className="tbl-pg-btn"
              aria-label="Next page"
              disabled={safePage === totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              ›
            </button>
          </div>
          <select
            className="tbl-size-select"
            aria-label="Rows per page"
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="table-footer">
          <span className="table-result-count">
            {total === 0 ? "No results" : `${startRow}–${endRow} of ${total.toLocaleString()}`}
          </span>
          <div className="table-page-size">
            <span>Per page</span>
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
      )}
    </div>
  );
}
