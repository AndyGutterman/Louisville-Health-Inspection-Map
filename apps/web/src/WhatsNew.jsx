import React, { useState, useEffect, useRef, useCallback } from "react";
import { WHATS_NEW_TABS, scoreBadge, swipeTab, whatsNewDate } from "./lib/whatsNew.js";
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
          {/* First, so it survives the line's ellipsis */}
          {item.region === "bullitt" && <span className="wn-county">Bullitt</span>}
          {item.address ? (
            [item.address, whatsNewDate(item)].filter(Boolean).join(" · ")
          ) : (
            <>
              <span className="wn-noloc">Location unavailable</span>
              {whatsNewDate(item) && ` · ${whatsNewDate(item)}`}
            </>
          )}
        </div>
        {item.violation_count > 0 && (
          <div className="wn-viol">
            {item.violation_count} {item.violation_count === 1 ? "violation" : "violations"}
          </div>
        )}
      </div>
    </div>
  );
}

// Three columns side by side once the panel is dragged this wide (desktop only).
const WIDE_THRESHOLD = 720;
const DEFAULT_W = 360; // room for three tab labels on one line
const MIN_W = 340;
const MAX_W = 960;
const PREVIEW_ROWS = 5; // a tab shows this many until "Show all"
const COL_ICON = { issues: "⚠ ", perfect: "✓ " };

export default function WhatsNew({
  supabase,
  onOpenEstablishment,
  onHoverEstablishment,
  onHoverEstablishmentEnd,
  open,
  onClose,
  onOpen,
}) {
  const [tab, setTab] = useState(WHATS_NEW_TABS[0].id);
  const [lists, setLists] = useState({}); // tab id -> { rows, loading, error }
  const [showAll, setShowAll] = useState(false);
  const [panelW, setPanelW] = useState(DEFAULT_W);
  const dragRef = useRef({ on: false });
  const touchRef = useRef({ x: 0 });
  const requestedRef = useRef(new Set()); // tabs already asked for, so each loads once

  const isMobile = typeof window !== "undefined" && window.innerWidth < 600;
  const isWide = !isMobile && panelW >= WIDE_THRESHOLD;

  // Each tab's rows load the first time it's shown; wide mode shows (and loads) them all.
  useEffect(() => {
    if (!open || !supabase) return;
    const wanted = isWide ? WHATS_NEW_TABS : WHATS_NEW_TABS.filter((t) => t.id === tab);
    for (const t of wanted) {
      if (requestedRef.current.has(t.id)) continue;
      requestedRef.current.add(t.id);
      setLists((l) => ({ ...l, [t.id]: { rows: [], loading: true, error: null } }));
      supabase.rpc(t.rpc, { limit_n: 20 }).then(({ data, error }) => {
        setLists((l) => ({
          ...l,
          [t.id]: { rows: data || [], loading: false, error: error?.message ?? null },
        }));
      });
    }
  }, [open, supabase, tab, isWide]);

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
    const max = Math.min(MAX_W, window.innerWidth - 32);
    setPanelW(
      Math.max(MIN_W, Math.min(max, dragRef.current.w0 + (e.clientX - dragRef.current.x0))),
    );
  }, []);
  const onResizeUp = useCallback(() => {
    dragRef.current.on = false;
  }, []);

  const switchTab = (t) => {
    setTab(t);
    setShowAll(false);
  };

  // Swipe to change tabs
  const onTouchStart = (e) => {
    touchRef.current.x = e.touches[0].clientX;
  };
  const onTouchEnd = (e) => {
    const dx = e.changedTouches[0].clientX - touchRef.current.x;
    if (Math.abs(dx) < 60) return;
    switchTab(swipeTab(tab, dx));
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

  // One tab's rows (all of them, or the first `limit`), or its loading/empty/error line.
  const renderRows = (t, limit) => {
    const list = lists[t.id];
    if (!list || list.loading) return <div className="wn-loading">Loading…</div>;
    if (list.error) return <div className="wn-error">Could not load.</div>;
    if (!list.rows.length) return <div className="wn-empty">{t.empty}</div>;
    return (limit ? list.rows.slice(0, limit) : list.rows).map((item, i) => (
      <ScoreCard
        key={`${item.establishment_id}-${i}`}
        item={item}
        score={item.score}
        badgeClass={scoreBadge(item.score, t.id)}
        onOpen={onOpenEstablishment}
        onHover={onHoverEstablishment}
        onHoverEnd={onHoverEstablishmentEnd}
      />
    ));
  };

  const active = WHATS_NEW_TABS.find((t) => t.id === tab);
  const activeList = lists[tab];

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

        {/* Single-row header: flame | tabs | close */}
        <div className="wn-header">
          <FlameIcon className="wn-header-flame" />
          {WHATS_NEW_TABS.map((t) => (
            <button
              key={t.id}
              className={`wn-tab${tab === t.id ? ` active-${t.id}` : ""}`}
              aria-pressed={tab === t.id}
              onClick={() => switchTab(t.id)}
            >
              {t.label}
            </button>
          ))}
          <button className="wn-close" onClick={onClose} aria-label="Close What's New">
            ×
          </button>
        </div>

        {isWide ? (
          /* ── Every tab side by side ── */
          <div className="wn-dual">
            {WHATS_NEW_TABS.map((t) => (
              <div className="wn-col" key={t.id}>
                <div className={`wn-col-hd ${t.id}`}>
                  {COL_ICON[t.id] ?? ""}
                  {t.label}
                </div>
                <div className="wn-col-body">{renderRows(t)}</div>
              </div>
            ))}
          </div>
        ) : (
          /* ── One tab at a time ── */
          <>
            <div
              className="wn-body"
              onTouchStart={isMobile ? onTouchStart : undefined}
              onTouchEnd={isMobile ? onTouchEnd : undefined}
            >
              {renderRows(active, showAll ? 0 : PREVIEW_ROWS)}
            </div>
            {activeList && !activeList.loading && activeList.rows.length > PREVIEW_ROWS && (
              <button className="wn-more" onClick={() => setShowAll((v) => !v)}>
                {showAll ? "Show fewer" : `Show all ${activeList.rows.length}`}
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
}
