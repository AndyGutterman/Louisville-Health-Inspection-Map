import React, { useState, useEffect, useRef, useCallback } from "react";
import { WHATS_NEW_TABS, scoreBadge, swipeTab, whatsNewDate } from "./lib/whatsNew.js";
import { regionOfId } from "./lib/regions.js";
import { fetchWhatsNewList } from "./api/whatsNew.js";
import { useT } from "./I18nContext.jsx";
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
  const { t, locale } = useT();
  const date = whatsNewDate(item, { posted: t("whatsNew.posted"), locale });
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
            [item.address, date].filter(Boolean).join(" · ")
          ) : (
            <>
              <span className="wn-noloc">{t("whatsNew.noLocation")}</span>
              {date && ` · ${date}`}
            </>
          )}
        </div>
        {item.violation_count > 0 && (
          <div className="wn-viol">{t("violations", { n: item.violation_count })}</div>
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
  onOpenEstablishment,
  onHoverEstablishment,
  onHoverEstablishmentEnd,
  counties, // ids of the counties switched on; rows from other counties are left out
  open,
  onClose,
  onOpen,
}) {
  const { t } = useT();
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
    if (!open) return;
    const wanted = isWide ? WHATS_NEW_TABS : WHATS_NEW_TABS.filter((d) => d.id === tab);
    for (const d of wanted) {
      if (requestedRef.current.has(d.id)) continue;
      requestedRef.current.add(d.id);
      setLists((l) => ({ ...l, [d.id]: { rows: [], loading: true, error: null } }));
      fetchWhatsNewList(d.rpc).then(({ data, error }) => {
        setLists((l) => ({
          ...l,
          [d.id]: { rows: data || [], loading: false, error: error?.message ?? null },
        }));
      });
    }
  }, [open, tab, isWide]);

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
        <button
          className="wn-trigger"
          onClick={onOpen}
          aria-label={t("whatsNew.open")}
          title={t("whatsNew.open")}
        >
          <FlameIcon className="wn-trigger-icon" />
        </button>
      </>
    );
  }

  // A tab's rows in the counties switched on (the lists are loaded once, for every
  // county, and narrowed here, so switching a county costs no request).
  const rowsOf = (list) =>
    counties
      ? list.rows.filter((r) => counties.includes(regionOfId(r.establishment_id).id))
      : list.rows;

  // One tab's rows (all of them, or the first `limit`), or its loading/empty/error line.
  const renderRows = (d, limit) => {
    const list = lists[d.id];
    if (!list || list.loading) return <div className="wn-loading">{t("whatsNew.loading")}</div>;
    if (list.error) return <div className="wn-error">{t("whatsNew.error")}</div>;
    const rows = rowsOf(list);
    if (!rows.length) return <div className="wn-empty">{t(`whatsNew.empty.${d.id}`)}</div>;
    return (limit ? rows.slice(0, limit) : rows).map((item, i) => (
      <ScoreCard
        key={`${item.establishment_id}-${i}`}
        item={item}
        score={item.score}
        badgeClass={scoreBadge(item.score, d.id)}
        onOpen={onOpenEstablishment}
        onHover={onHoverEstablishment}
        onHoverEnd={onHoverEstablishmentEnd}
      />
    ));
  };

  const active = WHATS_NEW_TABS.find((d) => d.id === tab);
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
          {WHATS_NEW_TABS.map((d) => (
            <button
              key={d.id}
              className={`wn-tab${tab === d.id ? ` active-${d.id}` : ""}`}
              aria-pressed={tab === d.id}
              onClick={() => switchTab(d.id)}
            >
              {t(`whatsNew.tab.${d.id}`)}
            </button>
          ))}
          <button className="wn-close" onClick={onClose} aria-label={t("whatsNew.close")}>
            ×
          </button>
        </div>

        {isWide ? (
          /* ── Every tab side by side ── */
          <div className="wn-dual">
            {WHATS_NEW_TABS.map((d) => (
              <div className="wn-col" key={d.id}>
                <div className={`wn-col-hd ${d.id}`}>
                  {COL_ICON[d.id] ?? ""}
                  {t(`whatsNew.tab.${d.id}`)}
                </div>
                <div className="wn-col-body">{renderRows(d)}</div>
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
            {activeList && !activeList.loading && rowsOf(activeList).length > PREVIEW_ROWS && (
              <button className="wn-more" onClick={() => setShowAll((v) => !v)}>
                {showAll
                  ? t("whatsNew.showFewer")
                  : t("whatsNew.showAll", { n: rowsOf(activeList).length })}
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
}
