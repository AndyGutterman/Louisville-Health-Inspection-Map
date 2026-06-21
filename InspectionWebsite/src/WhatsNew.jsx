import React, { useState, useEffect, useRef, useCallback } from "react";

const STYLES = `
/* ── Collapsed trigger — aligns with Table View at bottom: 28px ── */
.wn-trigger {
  position: fixed;
  bottom: 28px;
  left: 16px;
  width: 52px;
  height: 52px;
  border-radius: 14px;
  background: rgba(18,18,22,0.96);
  border: 1px solid rgba(249,115,22,0.22);
  box-shadow: 0 4px 20px rgba(0,0,0,0.45), 0 0 12px rgba(249,115,22,0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 2800;
  transition: border-color .15s, background .15s, box-shadow .15s;
  backdrop-filter: blur(8px);
}
.wn-trigger:hover {
  border-color: rgba(249,115,22,0.45);
  background: rgba(24,20,18,0.99);
  box-shadow: 0 6px 24px rgba(0,0,0,0.55), 0 0 18px rgba(249,115,22,0.18);
}
.wn-trigger-icon {
  width: 30px; height: 30px;
  color: #f97316;
  opacity: 0.80;
  transition: opacity .15s, filter .15s;
  filter: drop-shadow(0 0 3px rgba(249,115,22,0.35));
}
.wn-trigger:hover .wn-trigger-icon {
  opacity: 1;
  filter: drop-shadow(0 0 6px rgba(249,115,22,0.60));
}

/* ── Expanded panel ── */
.wn-panel {
  position: fixed;
  bottom: 88px;
  left: 16px;
  width: var(--wn-w, 320px);
  background: rgba(18,18,22,0.97);
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: 14px;
  color: #f0f0f3;
  font-family: "Helvetica Neue", Arial, sans-serif;
  box-shadow: 0 10px 32px rgba(0,0,0,0.55);
  z-index: 2800;
  display: flex;
  flex-direction: column;
  max-height: 62dvh;
  overflow: hidden;
  backdrop-filter: blur(8px);
}

/* ── Header ── */
.wn-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px 0;
  flex-shrink: 0;
}
.wn-header-flame {
  width: 15px; height: 15px;
  color: #f97316;
  opacity: 0.70;
  flex-shrink: 0;
}

/* ── Tabs ── */
.wn-tabs {
  display: flex;
  gap: 2px;
  flex: 1;
}
.wn-tab {
  flex: 1;
  padding: 6px 0;
  border-radius: 8px 8px 0 0;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: rgba(255,255,255,0.38);
  font-size: .72rem;
  font-weight: 800;
  letter-spacing: .04em;
  text-transform: uppercase;
  cursor: pointer;
  transition: color .12s, border-color .12s;
}
.wn-tab:hover { color: rgba(255,255,255,0.65); }
.wn-tab.active-issues { color: #f97316; border-bottom-color: #f97316; }
.wn-tab.active-perfect { color: #6fcf8a; border-bottom-color: #6fcf8a; }
.wn-tab-bar {
  height: 1px;
  background: rgba(255,255,255,0.07);
  margin: 0 12px;
  flex-shrink: 0;
}

.wn-close {
  background: transparent;
  border: none;
  color: rgba(255,255,255,0.28);
  font-size: 16px;
  cursor: pointer;
  line-height: 1;
  padding: 3px 4px;
  border-radius: 6px;
  flex-shrink: 0;
  transition: color .12s, background .12s;
}
.wn-close:hover { color: rgba(255,255,255,0.70); background: rgba(255,255,255,0.07); }

/* ── Scrollable body ── */
.wn-body {
  overflow-y: auto;
  flex: 1;
  padding: 4px 0;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  touch-action: pan-y;
}
.wn-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 14px;
  cursor: pointer;
  border-bottom: 1px solid rgba(255,255,255,0.055);
  transition: background .12s;
}
.wn-card:last-child { border-bottom: none; }
.wn-card:hover { background: rgba(255,255,255,0.04); }

/* Score badges */
.wn-badge {
  flex-shrink: 0;
  width: 36px; height: 36px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: .82rem;
  font-weight: 800;
}
.wn-badge.perfect { background: rgba(52,168,83,0.22); color: #6fcf8a; border: 1px solid rgba(52,168,83,0.38); box-shadow: 0 0 8px rgba(52,168,83,0.18); }
.wn-badge.ok      { background: rgba(52,168,83,0.14); color: #6fcf8a; border: 1px solid rgba(52,168,83,0.28); }
.wn-badge.warn    { background: rgba(251,188,5,0.13); color: #e8ae00; border: 1px solid rgba(251,188,5,0.28); }
.wn-badge.bad     { background: rgba(234,67,53,0.14); color: #ff9a9a; border: 1px solid rgba(234,67,53,0.28); }
.wn-badge.na      { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.35); border: 1px solid rgba(255,255,255,0.12); }

.wn-info { flex: 1; min-width: 0; }
.wn-name {
  font-size: .82rem; font-weight: 600;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  color: rgba(255,255,255,0.88);
}
.wn-sub {
  font-size: .68rem; color: rgba(255,255,255,0.35);
  margin-top: 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.wn-crit {
  font-size: .62rem; font-weight: 800; letter-spacing: .05em; text-transform: uppercase;
  color: rgba(234,67,53,0.65); margin-top: 3px;
}

.wn-more {
  width: 100%; padding: 8px;
  background: transparent; border: none;
  border-top: 1px solid rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.35);
  font-size: .72rem; font-weight: 600;
  cursor: pointer; text-align: center; flex-shrink: 0;
  transition: background .12s, color .12s;
}
.wn-more:hover { background: rgba(255,255,255,0.03); color: rgba(255,255,255,0.60); }
.wn-empty  { padding: 20px 14px; text-align: center; font-size: .78rem; color: rgba(255,255,255,0.28); line-height: 1.5; }
.wn-loading{ padding: 20px 14px; text-align: center; font-size: .78rem; color: rgba(255,255,255,0.28); }
.wn-error  { padding: 20px 14px; text-align: center; font-size: .74rem; color: rgba(234,67,53,0.55); line-height: 1.5; }

/* Right-edge resize handle */
.wn-resize-r {
  position: absolute; right: 0; top: 0; bottom: 0; width: 5px;
  cursor: ew-resize; z-index: 10; border-radius: 0 14px 14px 0;
}
.wn-resize-r:hover { background: rgba(255,255,255,0.07); }

/* Mobile */
@media (max-width: 599px) {
  .wn-trigger { bottom: 28px; left: 12px; width: 48px; height: 48px; }
  .wn-panel {
    left: 8px; right: 8px; width: auto !important;
    bottom: 90px; max-height: 60dvh;
  }
}
`;

function FlameIcon({ className, style }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2C12 2 8 6 8 10C8 10 6 9 6 7C6 7 3 11 3 14C3 18.418 7.134 22 12 22C16.866 22 21 18.418 21 14C21 10 17 6 12 2Z"
        fill="currentColor" opacity="0.75" />
      <path d="M12 14C12 14 10 12.5 10 11C10 11 11 12 12 12C13 12 14.5 10.5 14 8C14 8 16 10 16 13C16 15.209 14.209 17 12 17C9.791 17 8 15.209 8 13"
        fill="rgba(255,255,255,0.22)" />
    </svg>
  );
}

function formatDate(val) {
  if (!val) return "";
  const m = String(val).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2]-1, +m[3]))
    .toLocaleDateString(undefined, { timeZone: "UTC", month: "short", day: "numeric" });
  return String(val);
}

function ScoreCard({ item, score, badgeClass, onOpen }) {
  return (
    <div
      className="wn-card"
      onClick={() => onOpen?.(item.establishment_id)}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onOpen?.(item.establishment_id); }}
    >
      <div className={`wn-badge ${badgeClass}`}>{score == null || score === 0 ? "–" : score}</div>
      <div className="wn-info">
        <div className="wn-name">{item.premise_name || item.establishment_id}</div>
        <div className="wn-sub">
          {[item.address, formatDate(item.inspection_date || item.inspection_date_recent)].filter(Boolean).join(" · ")}
        </div>
        {item.critical_count > 0 && (
          <div className="wn-crit">{item.critical_count} critical {item.critical_count === 1 ? "violation" : "violations"}</div>
        )}
      </div>
    </div>
  );
}

export default function WhatsNew({ supabase, onOpenEstablishment, open, onClose, onOpen }) {
  const [tab, setTab]             = useState("issues");   // "issues" | "perfect"
  const [issues, setIssues]       = useState([]);
  const [perfect, setPerfect]     = useState([]);
  const [issuesLoading, setIssuesLoading] = useState(false);
  const [perfectLoading, setPerfectLoading] = useState(false);
  const [issuesError, setIssuesError]   = useState(null);
  const [showAll, setShowAll]     = useState(false);
  const [panelW, setPanelW]       = useState(320);
  const dragRef    = useRef({ on: false });
  const touchRef   = useRef({ x: 0 });
  const loadedRef  = useRef({ issues: false, perfect: false });

  const isMobile = typeof window !== "undefined" && window.innerWidth < 600;

  // Load issues tab data
  useEffect(() => {
    if (!open || !supabase || loadedRef.current.issues) return;
    loadedRef.current.issues = true;
    setIssuesLoading(true);
    supabase.rpc("get_whats_new", { limit_n: 20 }).then(({ data, error }) => {
      if (error) { setIssuesError(error.message); }
      else setIssues(data || []);
      setIssuesLoading(false);
    });
  }, [open, supabase]);

  // Load perfect-100s data on demand
  useEffect(() => {
    if (!open || tab !== "perfect" || !supabase || loadedRef.current.perfect) return;
    loadedRef.current.perfect = true;
    setPerfectLoading(true);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 60);
    supabase
      .from("v_facility_map_feed")
      .select("establishment_id, premise_name, address, score_recent, inspection_date_recent")
      .eq("score_recent", 100)
      .gte("inspection_date_recent", cutoff.toISOString().slice(0, 10))
      .order("inspection_date_recent", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        setPerfect(data || []);
        setPerfectLoading(false);
      });
  }, [open, tab, supabase]);

  // Resize handle
  const onResizeDown = useCallback((e) => {
    e.preventDefault();
    dragRef.current = { on: true, x0: e.clientX, w0: panelW };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [panelW]);
  const onResizeMove = useCallback((e) => {
    if (!dragRef.current.on) return;
    setPanelW(Math.max(260, Math.min(520, dragRef.current.w0 + (e.clientX - dragRef.current.x0))));
  }, []);
  const onResizeUp = useCallback(() => { dragRef.current.on = false; }, []);

  // Swipe to change tabs
  const onTouchStart = (e) => { touchRef.current.x = e.touches[0].clientX; };
  const onTouchEnd   = (e) => {
    const dx = e.changedTouches[0].clientX - touchRef.current.x;
    if (Math.abs(dx) < 60) return;
    setTab(dx < 0 ? "perfect" : "issues");
    setShowAll(false);
  };

  const switchTab = (t) => { setTab(t); setShowAll(false); };

  // Collapsed state — just the trigger button
  if (!open) {
    return (
      <>
        <style>{STYLES}</style>
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
      if (issuesError) return (
        <div className="wn-error">
          Could not load.<br />
          <span style={{ fontSize: ".68rem", opacity: .7 }}>Run the get_whats_new migration in Supabase.</span>
        </div>
      );
      if (!issues.length) return <div className="wn-empty">No flagged inspections in the last 30 days.</div>;
      const visible = showAll ? issues : issues.slice(0, 5);
      return (
        <>
          {visible.map((item, i) => {
            const s = item.score;
            const bc = s == null || s === 0 ? "na" : s < 85 ? "bad" : s < 95 ? "warn" : "ok";
            return <ScoreCard key={`${item.establishment_id}-${i}`} item={item} score={s} badgeClass={bc} onOpen={onOpenEstablishment} />;
          })}
        </>
      );
    }

    // Perfect 100s tab
    if (perfectLoading) return <div className="wn-loading">Loading…</div>;
    if (!perfect.length) return <div className="wn-empty">No perfect scores in the last 60 days.</div>;
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
          />
        ))}
      </>
    );
  };

  const activeList = tab === "issues" ? issues : perfect;
  const activeLoading = tab === "issues" ? issuesLoading : perfectLoading;

  return (
    <>
      <style>{STYLES}</style>
      <div
        className="wn-panel"
        style={!isMobile ? { "--wn-w": `${panelW}px` } : undefined}
        onPointerMove={!isMobile ? onResizeMove : undefined}
        onPointerUp={!isMobile ? onResizeUp : undefined}
        onPointerCancel={!isMobile ? onResizeUp : undefined}
      >
        {!isMobile && <div className="wn-resize-r" aria-hidden="true" onPointerDown={onResizeDown} />}

        {/* Header: flame + tabs + close */}
        <div className="wn-header">
          <FlameIcon className="wn-header-flame" />
          <div className="wn-tabs">
            <button
              className={`wn-tab${tab === "issues" ? " active-issues" : ""}`}
              onClick={() => switchTab("issues")}
            >
              Issues
            </button>
            <button
              className={`wn-tab${tab === "perfect" ? " active-perfect" : ""}`}
              onClick={() => switchTab("perfect")}
            >
              100s ✓
            </button>
          </div>
          <button className="wn-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="wn-tab-bar" />

        {/* Swipeable body */}
        <div
          className="wn-body"
          onTouchStart={isMobile ? onTouchStart : undefined}
          onTouchEnd={isMobile ? onTouchEnd : undefined}
        >
          {renderList()}
        </div>

        {!activeLoading && activeList.length > 5 && (
          <button className="wn-more" onClick={() => setShowAll(v => !v)}>
            {showAll ? "Show fewer" : `Show all ${activeList.length}`}
          </button>
        )}
      </div>
    </>
  );
}
