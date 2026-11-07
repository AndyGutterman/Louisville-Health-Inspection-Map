import React, { useState, useEffect, useRef, useCallback } from "react";
import { formatMonthDay } from "./lib/dates.js";
import "./styles/WhatsNew.css";

function FlameIcon({ className, style }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2C12 2 8 6 8 10C8 10 6 9 6 7C6 7 3 11 3 14C3 18.418 7.134 22 12 22C16.866 22 21 18.418 21 14C21 10 17 6 12 2Z"
        fill="currentColor"
        opacity="0.75"
      />
      <path
        d="M12 14C12 14 10 12.5 10 11C10 11 11 12 12 12C13 12 14.5 10.5 14 8C14 8 16 10 16 13C16 15.209 14.209 17 12 17C9.791 17 8 15.209 8 13"
        fill="rgba(255,255,255,0.22)"
      />
    </svg>
  );
}

function ScoreCard({ item, score, badgeClass, onOpen, onHover, onHoverEnd }) {
  return (
    <div
      data-testid="whats-new-row"
      data-eid={item.establishment_id}
      className="wn-card"
      onClick={() => onOpen?.(item.establishment_id, item)}
      onMouseEnter={() => onHover?.(item.establishment_id)}
      onMouseLeave={() => onHoverEnd?.()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpen?.(item.establishment_id, item);
      }}
    >
      <div className={`wn-badge ${badgeClass}`}>{score == null || score === 0 ? "–" : score}</div>
      <div className="wn-info">
        <div className="wn-name">{item.premise_name || item.establishment_id}</div>
        <div className="wn-sub">
          {item.address ? (
            [item.address, formatMonthDay(item.inspection_date || item.inspection_date_recent)]
              .filter(Boolean)
              .join(" · ")
          ) : (
            <>
              <span className="wn-noloc">Location unavailable</span>
              {formatMonthDay(item.inspection_date || item.inspection_date_recent) &&
                ` · ${formatMonthDay(item.inspection_date || item.inspection_date_recent)}`}
            </>
          )}
        </div>
        {item.critical_count > 0 && (
          <div className="wn-crit">
            {item.critical_count} critical {item.critical_count === 1 ? "violation" : "violations"}
          </div>
        )}
      </div>
    </div>
  );
}

export default function WhatsNew({
  supabase,
  onOpenEstablishment,
  onHoverEstablishment,
  onHoverEstablishmentEnd,
  open,
  onClose,
  onOpen,
}) {
  const [tab, setTab] = useState("issues"); // "issues" | "perfect"
  const [issues, setIssues] = useState([]);
  const [perfect, setPerfect] = useState([]);
  const [issuesLoading, setIssuesLoading] = useState(false);
  const [perfectLoading, setPerfectLoading] = useState(false);
  const [issuesError, setIssuesError] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [panelW, setPanelW] = useState(320);
  const dragRef = useRef({ on: false });
  const touchRef = useRef({ x: 0 });
  const loadedRef = useRef({ issues: false, perfect: false });

  const isMobile = typeof window !== "undefined" && window.innerWidth < 600;

  // Load issues tab data
  useEffect(() => {
    if (!open || !supabase || loadedRef.current.issues) return;
    loadedRef.current.issues = true;
    setIssuesLoading(true);
    supabase.rpc("get_whats_new", { limit_n: 20 }).then(({ data, error }) => {
      if (error) {
        setIssuesError(error.message);
      } else setIssues(data || []);
      setIssuesLoading(false);
    });
  }, [open, supabase]);

  const WIDE_THRESHOLD = 520;
  const isWide = !isMobile && panelW >= WIDE_THRESHOLD;

  // Load perfect-100s on demand — no date cap, always shows the latest 100s
  // Also triggers when entering wide mode (both columns shown simultaneously)
  useEffect(() => {
    if (!open || (!isWide && tab !== "perfect") || !supabase || loadedRef.current.perfect) return;
    loadedRef.current.perfect = true;
    setPerfectLoading(true);
    supabase
      .from("v_facility_map_feed")
      .select("establishment_id, premise_name, address, score_recent, inspection_date_recent")
      .eq("score_recent", 100)
      .order("inspection_date_recent", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        setPerfect(data || []);
        setPerfectLoading(false);
      });
  }, [open, tab, supabase, isWide]);

  // Resize handle
  const onResizeDown = useCallback(
    (e) => {
      e.preventDefault();
      dragRef.current = { on: true, x0: e.clientX, w0: panelW };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [panelW],
  );

  const onResizeMove = useCallback((e) => {
    if (!dragRef.current.on) return;
    setPanelW(Math.max(260, Math.min(700, dragRef.current.w0 + (e.clientX - dragRef.current.x0))));
  }, []);
  const onResizeUp = useCallback(() => {
    dragRef.current.on = false;
  }, []);

  // Swipe to change tabs
  const onTouchStart = (e) => {
    touchRef.current.x = e.touches[0].clientX;
  };
  const onTouchEnd = (e) => {
    const dx = e.changedTouches[0].clientX - touchRef.current.x;
    if (Math.abs(dx) < 60) return;
    setTab(dx < 0 ? "perfect" : "issues");
    setShowAll(false);
  };

  const switchTab = (t) => {
    setTab(t);
    setShowAll(false);
  };

  // Collapsed state — just the trigger button
  if (!open) {
    return (
      <>
        <button className="wn-trigger" onClick={onOpen} aria-label="What's New" title="What's New">
          <FlameIcon className="wn-trigger-icon" />
        </button>
      </>
    );
  }

  // Render the active tab list
  const renderList = () => {
    if (tab === "issues") {
      if (issuesLoading) return <div className="wn-loading">Loading…</div>;
      if (issuesError)
        return (
          <div className="wn-error">
            Could not load.
            <br />
            <span style={{ fontSize: ".68rem", opacity: 0.7 }}>
              Run the get_whats_new migration in Supabase.
            </span>
          </div>
        );
      if (!issues.length)
        return <div className="wn-empty">No flagged inspections in the last 30 days.</div>;
      const visible = showAll ? issues : issues.slice(0, 5);
      return (
        <>
          {visible.map((item, i) => {
            const s = item.score;
            const bc = s == null || s === 0 ? "na" : s < 85 ? "bad" : s < 95 ? "warn" : "ok";
            return (
              <ScoreCard
                key={`${item.establishment_id}-${i}`}
                item={item}
                score={s}
                badgeClass={bc}
                onOpen={onOpenEstablishment}
                onHover={onHoverEstablishment}
                onHoverEnd={onHoverEstablishmentEnd}
              />
            );
          })}
        </>
      );
    }

    // Perfect 100s tab
    if (perfectLoading) return <div className="wn-loading">Loading…</div>;
    if (!perfect.length)
      return <div className="wn-empty">No perfect scores in the last 60 days.</div>;
    const visible = showAll ? perfect : perfect.slice(0, 5);
    return (
      <>
        {visible.map((item, i) => (
          <ScoreCard
            key={`${item.establishment_id}-${i}`}
            item={{ ...item, inspection_date: item.inspection_date_recent }}
            score={item.score_recent}
            badgeClass="perfect"
            onOpen={onOpenEstablishment}
            onHover={onHoverEstablishment}
            onHoverEnd={onHoverEstablishmentEnd}
          />
        ))}
      </>
    );
  };

  const activeList = tab === "issues" ? issues : perfect;
  const activeLoading = tab === "issues" ? issuesLoading : perfectLoading;

  return (
    <>
      <div
        data-testid="whats-new-panel"
        className="wn-panel"
        style={!isMobile ? { "--wn-w": `${panelW}px` } : undefined}
        onPointerMove={!isMobile ? onResizeMove : undefined}
        onPointerUp={!isMobile ? onResizeUp : undefined}
        onPointerCancel={!isMobile ? onResizeUp : undefined}
      >
        {!isMobile && (
          <div className="wn-resize-r" aria-hidden="true" onPointerDown={onResizeDown} />
        )}

        {/* Single-row header: flame | tab | tab | close */}
        <div className="wn-header">
          <FlameIcon className="wn-header-flame" />
          <button
            className={`wn-tab${tab === "issues" ? " active-issues" : ""}`}
            onClick={() => switchTab("issues")}
          >
            Violations
          </button>
          <button
            className={`wn-tab${tab === "perfect" ? " active-perfect" : ""}`}
            onClick={() => switchTab("perfect")}
          >
            Top Scores
          </button>
          <button className="wn-close" onClick={onClose} aria-label="Close What's New">
            ×
          </button>
        </div>
        {/* no wn-tab-bar needed — pills don't use underline */}

        {isWide ? (
          /* ── Two-column layout ── */
          <div className="wn-dual">
            <div className="wn-col">
              <div className="wn-col-hd violations">⚠ Violations</div>
              <div className="wn-col-body">
                {issuesLoading ? (
                  <div className="wn-loading">Loading…</div>
                ) : issuesError ? (
                  <div className="wn-error">Run get_whats_new migration first.</div>
                ) : issues.length === 0 ? (
                  <div className="wn-empty">No flagged inspections in last 30 days.</div>
                ) : (
                  issues.map((item, i) => {
                    const s = item.score;
                    const bc =
                      s == null || s === 0 ? "na" : s < 85 ? "bad" : s < 95 ? "warn" : "ok";
                    return (
                      <ScoreCard
                        key={`${item.establishment_id}-${i}`}
                        item={item}
                        score={s}
                        badgeClass={bc}
                        onOpen={onOpenEstablishment}
                        onHover={onHoverEstablishment}
                        onHoverEnd={onHoverEstablishmentEnd}
                      />
                    );
                  })
                )}
              </div>
            </div>
            <div className="wn-col">
              <div className="wn-col-hd perfect">✓ Top Scores</div>
              <div className="wn-col-body">
                {perfectLoading ? (
                  <div className="wn-loading">Loading…</div>
                ) : perfect.length === 0 ? (
                  <div className="wn-empty">No perfect scores found.</div>
                ) : (
                  perfect.map((item, i) => (
                    <ScoreCard
                      key={`${item.establishment_id}-${i}`}
                      item={{ ...item, inspection_date: item.inspection_date_recent }}
                      score={item.score_recent}
                      badgeClass="perfect"
                      onOpen={onOpenEstablishment}
                      onHover={onHoverEstablishment}
                      onHoverEnd={onHoverEstablishmentEnd}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          /* ── Single-column tab layout ── */
          <>
            <div
              className="wn-body"
              onTouchStart={isMobile ? onTouchStart : undefined}
              onTouchEnd={isMobile ? onTouchEnd : undefined}
            >
              {renderList()}
            </div>
            {!activeLoading && activeList.length > 5 && (
              <button className="wn-more" onClick={() => setShowAll((v) => !v)}>
                {showAll ? "Show fewer" : `Show all ${activeList.length}`}
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
}
