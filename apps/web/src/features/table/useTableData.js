// Table View's rows: one page at a time from v_table_latest / v_table_inspections
// (api/table.js), plus the list of inspection types for the Type chips.
import { useEffect, useRef, useState } from "react";
import { fetchInspectionTypes, fetchTablePage } from "../../api/table.js";
import {
  combineOr,
  countKey,
  facilityFilter,
  searchFilters,
  typedCounties,
} from "../../lib/tableQuery.js";
import { TABLE_REGIONS } from "./tableRegions.js";

/**
 * @param {object} q
 * @param {boolean} q.hidden      the table is closed: nothing loads until it first opens
 * @param {object[]} q.regions    the counties listed (lib/counties.js tableCounties)
 * @param {string|null} q.county  the county picked, or null for every listed county
 * @param {boolean} q.facilityOn  the Facility chips can filter what's listed
 * @returns {{ rows: object[], total: number, loading: boolean, error: string|null, types: object[] }}
 */
export function useTableData({
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
}) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [types, setTypes] = useState([]);
  // The filters the current `total` was counted for (lib/tableQuery.js countKey).
  const countedFor = useRef(null);

  // Fetch inspection type list once, the first time the table opens.
  const [typesWanted, setTypesWanted] = useState(false);
  useEffect(() => {
    if (!hidden) setTypesWanted(true);
  }, [hidden]);
  useEffect(() => {
    if (!typesWanted) return;
    fetchInspectionTypes().then(({ data, error }) => {
      if (error) {
        console.warn("v_inspection_types:", error.message);
        return;
      }
      setTypes((data || []).map((r) => ({ type: r.ins_type_desc, count: Number(r.cnt) })));
    });
  }, [typesWanted]);

  // Main data fetch. Nothing loads until the table is first opened, and the row count is
  // only asked for when the filters change, not on every page.
  useEffect(() => {
    if (!typesWanted) return;
    // No listed county is switched on: nothing to ask the database for.
    if (REGIONS.length === 0) {
      setRows([]);
      setTotal(0);
      setLoading(false);
      countedFor.current = null;
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const view = latestOnly ? "v_table_latest" : "v_table_inspections";
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const col = sortAxis === "score" ? "score" : sortAxis === "name" ? "name" : "inspection_date";
    const asc = sortDir === "asc";
    // Facility chips only cover counties with facility types (see toggleCat).
    const cats = facilityOn ? selCats : null;
    // The counties to read: the one picked, else those switched on (only the ones with
    // facility types when a facility chip is on).
    const wanted = county ? [county] : cats ? typedCounties(REGIONS) : REGIONS.map((r) => r.id);
    const key = countKey({
      view,
      region: wanted.join("+"),
      hideNA,
      types: selTypes,
      cats: selCats,
      search: dbSearch,
    });
    const wantCount = countedFor.current !== key;

    fetchTablePage({
      view,
      wantCount,
      col,
      asc,
      from,
      to,
      // No region filter when every county the views hold is wanted.
      regions: wanted.length === 1 || wanted.length < TABLE_REGIONS.length ? wanted : null,
      hideNA,
      types: selTypes,
      or: combineOr(...searchFilters(dbSearch), facilityFilter(cats)),
    }).then(({ data, error, count }) => {
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
    typesWanted,
    page,
    pageSize,
    sortAxis,
    sortDir,
    dbSearch,
    selTypes,
    selCats,
    county,
    REGIONS,
    facilityOn,
    latestOnly,
    hideNA,
  ]);

  return { rows, total, loading, error, types };
}
