// The Learn page's violation database: every kind of violation, how often it was cited
// in a chosen period, searchable, and opening to the places cited for it.
import React, { useState, useEffect, useMemo } from "react";
import { summarizeViolations } from "../../lib/violationSummary.js";
import { toTitleCase } from "../../lib/titleCase.js";
import { fetchPlacesWithViolation, fetchViolationSummary } from "../../api/learn.js";

// ─── Timeline options ────────────────────────────────────────────────────────
const TIMELINE_OPTS = [
  {
    key: "all",
    label: "All time",
    days: null,
    note: "Every recorded citation since data collection began.",
  },
  { key: "12mo", label: "12 months", days: 365, note: "Citations from the past 12 months only." },
  { key: "6mo", label: "6 months", days: 182, note: "Citations from the past 6 months only." },
  { key: "3mo", label: "3 months", days: 91, note: "Citations from the past 3 months only." },
];

// ─── Violations database section ─────────────────────────────────────────────
const PAGE_SIZE = 40;

export default function ViolationDatabase({ initialCutoffDate, onOpenEstablishment }) {
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
        setError(e.message || "Failed to load violations");
      } finally {
        setLoading(false);
      }
    })();
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
  const scopeNote = TIMELINE_OPTS.find((o) => o.key === timeline)?.note ?? "";

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
        <span className="ln-vdb-tl-label">Showing</span>
        {TIMELINE_OPTS.map((opt) => (
          <button
            key={opt.key}
            className={"ln-vdb-tl-btn" + (timeline === opt.key ? " tl-active" : "")}
            onClick={() => {
              setTimeline(opt.key);
              setSearch("");
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="ln-vdb-loading">Loading violations…</div>
      ) : error ? (
        <div className="ln-vdb-loading" style={{ color: "#ff9a9a" }}>
          Error: {error}
        </div>
      ) : (
        <>
          <p className="ln-vdb-scope-note">{scopeNote}</p>

          {/* Stats */}
          <div className="ln-vdb-stats">
            <span className="ln-vdb-stat">
              <strong>{rows.length.toLocaleString()}</strong> distinct violation types
            </span>
            <span className="ln-vdb-stat">
              <strong>{totalCitations.toLocaleString()}</strong> total citations
              {timeline !== "all" && (
                <span style={{ color: "rgba(255,255,255,0.30)", fontWeight: 400 }}> in window</span>
              )}
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
                placeholder="Search violations…"
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
              No violations match "{search}".
              <br />
              <span style={{ fontSize: ".76rem", color: "rgba(255,255,255,0.30)" }}>
                Try a broader term.
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
                      title="Click to see establishments with this violation"
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
                      <div className="ln-vdb-count">{r.count.toLocaleString()}×</div>
                    </div>

                    {isExpanded && (
                      <div className="ln-vdb-drill">
                        <div className="ln-vdb-drill-title">Establishments with this violation</div>
                        {drillLoading ? (
                          <div className="ln-vdb-drill-loading">Loading…</div>
                        ) : drillData.length === 0 ? (
                          <div className="ln-vdb-drill-loading">
                            No results found in this time window.
                          </div>
                        ) : (
                          <>
                            <div className="ln-vdb-drill-chips">
                              {drillData.map((est) => {
                                const vDate = est.violation_date
                                  ? new Date(est.violation_date).toLocaleDateString(undefined, {
                                      month: "short",
                                      day: "numeric",
                                      year: "2-digit",
                                      timeZone: "UTC",
                                    })
                                  : null;
                                const vScore = est.violation_score ?? est.score_recent;
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
                                    {(vDate || vScore != null) && (
                                      <span
                                        className="ln-vdb-chip-score"
                                        title="Score · date when cited"
                                      >
                                        {vScore != null ? vScore : ""}
                                        {vDate ? ` · ${vDate}` : ""}
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                            {drillTotal >= 50 && (
                              <div className="ln-vdb-drill-more">
                                Showing top 50 results — search to narrow down.
                              </div>
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
              Show all {filtered.length.toLocaleString()} results
            </button>
          )}
          {showAll && filtered.length > PAGE_SIZE && (
            <button className="ln-vdb-show-more" onClick={() => setShowAll(false)}>
              Collapse
            </button>
          )}
        </>
      )}
    </>
  );
}
