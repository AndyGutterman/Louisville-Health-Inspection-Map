// Table View: every inspection in the counties switched on (lib/counties.js), searchable
// and sortable, read a page at a time from v_table_latest / v_table_inspections. On phones
// the filters fold away and rows become cards, so the list gets the room.
// This file holds the filter state and the layout; the rest is beside it:
//   useTableData    reads the rows          useTableResize  dragging the panel's edges
//   useTableSort    the sort                TableFilters    the chip rows
//   TableRows       cards and the grid      TableFooter     paging
import React, { useState, useRef, useEffect, useMemo } from "react";
import { useMediaQuery } from "../../hooks/useMediaQuery.js";
import { tableCounties } from "../../lib/counties.js";
import {
  FACILITY_CAT_KEYS,
  countyForFacility,
  facilityAppliesTo,
  typedCounties,
} from "../../lib/tableQuery.js";
import { useT } from "../../I18nContext.jsx";
import { ALL_IDS, ALL_REGIONS, joinNames } from "./tableRegions.js";
import { useTableData } from "./useTableData.js";
import { useTableResize } from "./useTableResize.js";
import { useTableSort } from "./useTableSort.js";
import TableFilters from "./TableFilters.jsx";
import TableFooter from "./TableFooter.jsx";
import { TableCards, TableGrid } from "./TableRows.jsx";

export default function TableView({
  onRowClick,
  onRowHover,
  onRowHoverEnd,
  counties = ALL_IDS, // ids of the counties switched on: the only ones listed and searched
  onClose,
  savedH,
  savedW,
  onResize,
  hidden,
  zIndex,
  onBringToFront,
}) {
  const { t } = useT();
  const isPhone = useMediaQuery("(max-width: 600px)");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const sort = useTableSort();
  const { sortAxis, sortDir } = sort;

  const [search, setSearch] = useState("");
  const [dbSearch, setDbSearch] = useState("");

  // Inspection type multiselect (null = All)
  const [selTypes, setSelTypes] = useState(null);

  // Facility category multiselect (null = All)
  const [selCats, setSelCats] = useState(null);

  // The counties this table lists: those switched on that the table views cover.
  const countiesKey = counties.join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- countiesKey stands for counties
  const REGIONS = useMemo(() => tableCounties(counties, ALL_REGIONS), [countiesKey]);
  // Switched on, but not in the table views yet (Oldham): said in a note, not hidden.
  const unlisted = ALL_REGIONS.filter((r) => !r.has.table && counties.includes(r.id));

  const [county, setCounty] = useState(null); // null = every listed county
  const [latestOnly, setLatestOnly] = useState(true);
  const [hideNA, setHideNA] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false); // phones: the chip rows
  const activeFilters = (county ? 1 : 0) + (selTypes ? 1 : 0) + (selCats ? 1 : 0);

  const size = useTableResize(savedH, savedW, onResize);
  const bodyRef = useRef(null);

  // A county that was picked here and then switched off goes back to "all".
  useEffect(() => {
    if (county && !REGIONS.some((r) => r.id === county)) setCounty(null);
  }, [county, REGIONS]);

  // Whether the Facility chips can filter what's listed: the picked county has facility
  // types, or (with none picked) one of the listed counties does.
  const facilityOn =
    facilityAppliesTo(county, REGIONS) && (county != null || typedCounties(REGIONS).length > 0);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDbSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset page on filter/sort change
  useEffect(() => {
    setPage(1);
  }, [
    sortAxis,
    sortDir,
    dbSearch,
    selTypes,
    selCats,
    county,
    countiesKey,
    latestOnly,
    pageSize,
    hideNA,
  ]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [page]);

  const { rows, total, loading, error, types } = useTableData({
    hidden,
    regions: REGIONS,
    county,
    facilityOn,
    latestOnly,
    hideNA,
    selTypes,
    selCats,
    dbSearch,
    sortAxis,
    sortDir,
    page,
    pageSize,
  });

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

  const openRow = (row) =>
    onRowClick?.({
      establishment_id: row.establishment_id,
      name: row.name,
      address: row.address,
      date: row.inspection_date,
      score: row.score,
      grade: row.grade,
    });
  const showFilters = !isPhone || filtersOpen;

  return (
    <div
      className={`table-panel${isPhone ? " table-panel--phone" : ""}`}
      data-testid="table-panel"
      style={{
        height: size.h,
        width: size.w,
        display: hidden ? "none" : undefined,
        zIndex: zIndex ?? 2900,
      }}
      onPointerDown={onBringToFront}
      onPointerMove={size.onPanelMove}
      onPointerUp={size.onPanelUp}
      onPointerCancel={size.onPanelUp}
    >
      {/* top edge resize handle — InfoDrawer-style gradient bar */}
      <div className="table-drag-top" onPointerDown={size.downH} />

      {/* right drag (width) */}
      <div className="table-drag-right" onPointerDown={size.downW} />

      {/* bottom edge resize handle — mirrors top */}
      <div className="table-drag-bottom" onPointerDown={size.downHBottom} />

      {/* corner drag bottom-right (diagonal) */}
      <div
        className="table-drag-corner"
        onPointerDown={(e) => size.downCorner(e, size.h, size.w)}
      />

      {/* corner drag top-right (diagonal) — more visible for new users */}
      <div
        className="table-drag-corner-tr"
        onPointerDown={(e) => size.downCorner(e, size.h, size.w)}
      />

      {/* header */}
      <div className="table-panel-header">
        <span className="table-panel-title">{t("table.title")}</span>
        <button className="table-panel-close" onClick={onClose} aria-label={t("table.close")}>
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
            placeholder={isPhone ? t("table.searchPhone") : t("table.searchPlaceholder")}
            aria-label={t("table.searchLabel")}
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
            {activeFilters ? t("table.filtersCount", { n: activeFilters }) : t("table.filters")}
          </button>
        )}

        <div className="tbl-toolbar-right">
          <button
            className={`tbl-pill-btn ${latestOnly ? "active" : ""}`}
            title={t("table.uniqueTitle")}
            onClick={() => setLatestOnly((v) => !v)}
          >
            {t("table.unique")}
          </button>

          <button
            className={`tbl-pill-btn ${hideNA ? "active" : ""}`}
            title={t("table.hideNATitle")}
            onClick={() => setHideNA((v) => !v)}
          >
            {t("table.hideNA")}
          </button>

          {/* Sort switch */}
          <div className="tbl-sort-switch" role="group" aria-label={t("table.sortBy")}>
            <button
              className={`tbl-sort-pill ${sortAxis === "date" ? "active" : ""}`}
              onClick={sort.handleDateSort}
              title={t("table.sortDateTitle")}
            >
              {sort.dateSortLabel}
            </button>
            <button
              className={`tbl-sort-pill ${sortAxis === "score" ? "active" : ""}`}
              onClick={sort.handleScoreSort}
              title={t("table.sortScoreTitle")}
            >
              {sort.scoreSortLabel}
            </button>
          </div>
        </div>
      </div>

      {showFilters && (
        <TableFilters
          regions={REGIONS}
          unlisted={unlisted}
          county={county}
          pickCounty={pickCounty}
          types={types}
          selTypes={selTypes}
          setSelTypes={setSelTypes}
          toggleType={toggleType}
          facilityOn={facilityOn}
          selCats={selCats}
          setSelCats={setSelCats}
          toggleCat={toggleCat}
        />
      )}

      {/* table */}
      <div className="table-body" ref={bodyRef}>
        {error && (
          <div className="tbl-error">
            ⚠ {error}
            <br />
            <small>{t("table.migrationHint")}</small>
          </div>
        )}
        {REGIONS.length === 0 && (
          <div className="tbl-empty-counties" data-testid="table-no-counties">
            {unlisted.length > 0
              ? `${t(unlisted.length > 1 ? "table.notInTable.many" : "table.notInTable.one", {
                  names: joinNames(
                    unlisted.map((r) => r.name),
                    t,
                  ),
                })}. `
              : `${t("table.noCounty")} `}
            {t("table.switchOn")}
          </div>
        )}
        {isPhone ? (
          <TableCards rows={rows} loading={loading} error={error} openRow={openRow} />
        ) : (
          <TableGrid
            rows={rows}
            loading={loading}
            error={error}
            openRow={openRow}
            sort={sort}
            onRowHover={onRowHover}
            onRowHoverEnd={onRowHoverEnd}
          />
        )}
      </div>

      <TableFooter
        isPhone={isPhone}
        total={total}
        page={page}
        pageSize={pageSize}
        setPage={setPage}
        setPageSize={setPageSize}
      />
    </div>
  );
}
