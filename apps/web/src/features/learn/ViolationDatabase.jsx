// The Learn page's violation database: every kind of violation, how often it was cited
// in a chosen period, searchable, and opening to the places cited for it.
import React, { useState, useEffect, useMemo } from "react";
import { citationShare, summarizeViolations } from "../../lib/violationSummary.js";
import { toTitleCase } from "../../lib/titleCase.js";
import Bold from "./Bold.jsx";
import { useT } from "../../I18nContext.jsx";
import { fetchPlacesWithViolation, fetchViolationSummary } from "../../api/learn.js";

// ─── Timeline options ────────────────────────────────────────────────────────
const TIMELINE_OPTS = [
  { key: "all", days: null },
  { key: "12mo", days: 365 },
  { key: "6mo", days: 182 },
  { key: "3mo", days: 91 },
];

// ─── Violations database section ─────────────────────────────────────────────
const PAGE_SIZE = 40;

export default function ViolationDatabase({ initialCutoffDate, onOpenEstablishment }) {
  const { t, locale } = useT();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [timeline, setTimeline] = useState("all"); // TIMELINE_OPTS key
  const [showAll, setShowAll] = useState(false);

  // Drill-down: which violation row is expanded + its establishments list
  const [expandedDesc, setExpandedDesc] = useState(null);
  const [drillData, setDrillData] = useState([]); // [{establishment_id, premise_name, address, score_recent}]
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillTotal, setDrillTotal] = useState(0);

  async function handleRowClick(desc) {
    if (expandedDesc === desc) {
      setExpandedDesc(null);
      return;
    }
    setExpandedDesc(desc);
    setDrillLoading(true);
    setDrillData([]);
    setDrillTotal(0);
    try {
      const { data, error } = await fetchPlacesWithViolation(desc, cutoffDate);
      if (error) throw error;
      setDrillData(data || []);
      setDrillTotal((data || []).length);
    } catch (e) {
      console.error("drill-down fetch error", e);
    } finally {
      setDrillLoading(false);
    }
  }

  // ISO cutoff date — use the more restrictive of map filter or local timeline
  const cutoffDate = useMemo(() => {
    const opt = TIMELINE_OPTS.find((o) => o.key === timeline);
    const localCutoff =
      opt && opt.days
        ? (() => {
            const d = new Date();
            d.setDate(d.getDate() - opt.days);
            return d.toISOString().slice(0, 10);
          })()
        : null;
    if (localCutoff && initialCutoffDate)
      return localCutoff > initialCutoffDate ? localCutoff : initialCutoffDate;
    return localCutoff ?? initialCutoffDate ?? null;
  }, [timeline, initialCutoffDate]);

  useEffect(() => {
    setLoading(true);
    setRows([]);
    setShowAll(false);

    (async () => {
      try {
        const { data, error: err } = await fetchViolationSummary(cutoffDate);

        if (err) throw err;

        setRows(
          summarizeViolations((data || []).map((r) => ({ desc: r.violation_desc, count: r.cnt }))),
        );
        setError(null);
      } catch (e) {
        // No fallback that pages through inspection_violations: one failed request used
        // to start a download of the whole table, a page at a time.
        setError(e.message || t("learn.vdb.failed"));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t only changes with the language
  }, [cutoffDate]);

  // Word-boundary regex — "rat" won't match inside "temperature"
  const searchRegex = useMemo(() => {
    const q = search.trim();
    if (!q) return null;
    try {
      return new RegExp("\\b" + q.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&"), "i");
    } catch {
      return null;
    }
  }, [search]);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (searchRegex && !searchRegex.test(r.desc)) return false;
        return true;
      }),
    [rows, searchRegex],
  );

  const visible = showAll ? filtered : filtered.slice(0, PAGE_SIZE);
  const totalCitations = rows.reduce((s, r) => s + r.count, 0);
  const scopeNote = t(`learn.vdb.tl.${timeline}.note`);

  function Highlighted({ text }) {
    if (!searchRegex) return <>{text}</>;
    const parts = text.split(searchRegex);
    const matches = text.match(searchRegex) || [];
    return (
      <>
        {parts.map((p, i) => (
          <React.Fragment key={i}>
            {p}
            {matches[i] && (
              <mark
                style={{
                  background: "rgba(251,188,5,0.28)",
                  color: "#fbbc05",
                  borderRadius: 2,
                  padding: "0 1px",
                }}
              >
                {matches[i]}
              </mark>
            )}
          </React.Fragment>
        ))}
      </>
    );
  }

  return (
    <>
      {/* Timeline selector */}
      <div className="ln-vdb-timeline">
        <span className="ln-vdb-tl-label">{t("learn.vdb.showing")}</span>
        {TIMELINE_OPTS.map((opt) => (
          <button
            key={opt.key}
            className={"ln-vdb-tl-btn" + (timeline === opt.key ? " tl-active" : "")}
            onClick={() => {
              setTimeline(opt.key);
              setSearch("");
            }}
          >
            {t(`learn.vdb.tl.${opt.key}`)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="ln-vdb-loading">{t("learn.vdb.loading")}</div>
      ) : error ? (
        <div className="ln-vdb-loading" style={{ color: "#ff9a9a" }}>
          {t("learn.vdb.error", { message: error })}
        </div>
      ) : (
        <>
          <p className="ln-vdb-scope-note">{scopeNote}</p>

          {/* Stats */}
          <div className="ln-vdb-stats">
            <span className="ln-vdb-stat">
              <Bold text={t("learn.vdb.types", { n: rows.length.toLocaleString(locale) })} />
            </span>
          </div>

          {/* Search */}
          <div className="ln-vdb-header">
            <div className="ln-vdb-search-wrap">
              <svg className="ln-vdb-search-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M15.5 14h-.79l-.28-.27A6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79L20 21.5 21.5 20zM9.5 14A4.5 4.5 0 1 1 14 9.5 4.505 4.505 0 0 1 9.5 14z"
                  fill="currentColor"
                />
              </svg>
              <input
                className="ln-vdb-search"
                type="text"
                placeholder={t("learn.vdb.search")}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setShowAll(false);
                }}
              />
            </div>
          </div>

          {/* List */}
          {filtered.length === 0 ? (
            <div className="ln-vdb-loading">
              {t("learn.vdb.noMatch", { search })}
              <br />
              <span style={{ fontSize: ".76rem", color: "rgba(255,255,255,0.30)" }}>
                {t("learn.vdb.broader")}
              </span>
            </div>
          ) : (
            <div className="ln-vdb-list">
              {visible.map((r, i) => {
                const isExpanded = expandedDesc === r.desc;
                return (
                  <React.Fragment key={i}>
                    <div
                      className={"ln-vdb-row" + (isExpanded ? " expanded" : "")}
                      onClick={() => handleRowClick(r.desc)}
                      title={t("learn.vdb.rowTitle")}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") handleRowClick(r.desc);
                      }}
                    >
                      <div className="ln-vdb-dot non" />
                      <div className="ln-vdb-desc">
                        <Highlighted text={toTitleCase(r.desc)} />
                      </div>
                      <div className="ln-vdb-count" title={t("learn.vdb.shareTitle")}>
                        {citationShare(r.count, totalCitations, locale)}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="ln-vdb-drill">
                        <div className="ln-vdb-drill-title">{t("learn.vdb.drillTitle")}</div>
                        {drillLoading ? (
                          <div className="ln-vdb-drill-loading">{t("learn.vdb.loadingShort")}</div>
                        ) : drillData.length === 0 ? (
                          <div className="ln-vdb-drill-loading">{t("learn.vdb.drillNone")}</div>
                        ) : (
                          <>
                            <div className="ln-vdb-drill-chips">
                              {drillData.map((est) => {
                                const vDate = est.violation_date
                                  ? new Date(est.violation_date).toLocaleDateString(locale, {
                                      month: "short",
                                      day: "numeric",
                                      year: "2-digit",
                                      timeZone: "UTC",
                                    })
                                  : null;
                                return (
                                  <button
                                    key={est.establishment_id}
                                    className="ln-vdb-chip"
                                    title={est.address || ""}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onOpenEstablishment?.(est.establishment_id);
                                    }}
                                  >
                                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                                      {est.premise_name || est.establishment_id}
                                    </span>
                                    {vDate && (
                                      <span
                                        className="ln-vdb-chip-score"
                                        title={t("learn.vdb.dateCited")}
                                      >
                                        {vDate}
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                            {drillTotal >= 50 && (
                              <div className="ln-vdb-drill-more">{t("learn.vdb.top50")}</div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          )}

          {!showAll && filtered.length > PAGE_SIZE && (
            <button className="ln-vdb-show-more" onClick={() => setShowAll(true)}>
              {t("learn.vdb.showAll", { n: filtered.length.toLocaleString(locale) })}
            </button>
          )}
          {showAll && filtered.length > PAGE_SIZE && (
            <button className="ln-vdb-show-more" onClick={() => setShowAll(false)}>
              {t("learn.vdb.collapse")}
            </button>
          )}
        </>
      )}
    </>
  );
}
