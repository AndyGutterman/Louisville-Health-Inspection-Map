import React, { useEffect, useRef, useState } from "react";
import "./styles/Violations.css";
import "./styles/History.css";
import "./styles/RestaurantInfo.css";
import { formatDateSafe } from "./lib/dates.js";
import { useMediaQuery } from "./hooks/useMediaQuery.js";
import {
  expandedHeight,
  computePeekHeight,
  clampSheetHeight,
  resolveSheetRelease,
} from "./lib/bottomSheet.js";

const displayField = (v) => (v === null ? "not listed" : v === undefined || v === "" ? "—" : v);

function CurrentInspectionCard({
  data,
  details,
  onSwitchTo,
  watchlisted,
  onSaveToWatchlist,
  onClose,
}) {
  // Hooks must run on every render, so this sits above the early return.
  const [open, setOpen] = React.useState(false);
  if (!data) return null;
  const {
    name,
    address,
    inspectionDate,
    score,
    grade,
    meta,
    metaTitle,
    similarNearby,
    noLocation,
    sourceNote,
    dateCaption,
  } = data;
  const gradeDisplay = grade && String(grade).trim().length > 0 ? String(grade).trim() : "—";
  const scoreNum =
    score != null && Number.isFinite(Number(score)) && Number(score) > 0 ? Number(score) : null;
  const badgeClass =
    scoreNum == null ? "na" : scoreNum >= 95 ? "ok" : scoreNum >= 85 ? "warn" : "bad";

  const scoreText = scoreNum === 0 || scoreNum == null ? "N/A" : scoreNum;

  const items = details
    ? [
        { label: "Opening date", value: displayField(details.opening_date) },
        { label: "Facility type", value: displayField(details.facility_type) },
        { label: "Subtype", value: displayField(details.subtype) },
        { label: "Permit number", value: displayField(details.permit_number) },
      ]
    : [];

  const hasDetails = items.some((i) => i.value && i.value !== "—");

  // similarNearby: [{eid, name}] — nearby permits that may represent the same place
  const similar = Array.isArray(similarNearby) ? similarNearby : [];

  return (
    <div
      className={`inspect-card ${open ? "open" : ""}`}
      onClick={() => setOpen((v) => !v)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") setOpen((v) => !v);
      }}
    >
      {meta && (
        <div className="inspect-meta" title={metaTitle || ""}>
          {meta}
        </div>
      )}

      <div className="inspect-card_header">
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="inspect-card_title">{name}</div>
            <div className="inspect-card_sub">{address}</div>
            {noLocation && (
              <div
                data-testid="drawer-no-location"
                style={{
                  marginTop: 6,
                  fontSize: ".78rem",
                  fontStyle: "italic",
                  color: "rgba(255,255,255,0.60)",
                }}
              >
                No map location on file for this establishment.
              </div>
            )}
            {sourceNote && (
              <div className="inspect-source-note" data-testid="drawer-source-note">
                {sourceNote}
              </div>
            )}
          </div>
          {/* Bookmark (rounded container) + plain × — top-right of card */}
          <div
            style={{ display: "flex", alignItems: "flex-start", gap: 3, flexShrink: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            {onSaveToWatchlist && (
              <button
                onClick={() => onSaveToWatchlist(data.establishment_id)}
                aria-label={watchlisted ? "Remove from watchlist" : "Save to watchlist"}
                title={watchlisted ? "Remove from watchlist" : "Save to watchlist"}
                style={{
                  width: 28,
                  height: 28,
                  minWidth: 28,
                  minHeight: 28,
                  maxWidth: 28,
                  maxHeight: 28,
                  boxSizing: "border-box",
                  padding: 0,
                  margin: 0,
                  flexShrink: 0,
                  lineHeight: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: watchlisted ? "rgba(52,168,83,0.25)" : "rgba(255,255,255,0.07)",
                  border: `1px solid ${watchlisted ? "rgba(52,168,83,0.50)" : "rgba(255,255,255,0.14)"}`,
                  borderRadius: "50%",
                  cursor: "pointer",
                  color: watchlisted ? "#ffffff" : "rgba(255,255,255,0.60)",
                  transition: "all .15s",
                }}
              >
                <span
                  style={{ display: "flex", lineHeight: 0 }}
                  dangerouslySetInnerHTML={{
                    __html: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"
                      fill="${watchlisted ? "#fff" : "none"}"
                      stroke="${watchlisted ? "#fff" : "rgba(255,255,255,0.70)"}"
                      stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>`,
                  }}
                />
              </button>
            )}
            {onClose && (
              <button
                onClick={onClose}
                aria-label="Close"
                style={{
                  background: "none",
                  border: "none",
                  width: 28,
                  height: 28,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                  cursor: "pointer",
                  color: "rgba(255,255,255,0.45)",
                  fontSize: 20,
                  lineHeight: 1,
                  transition: "color .12s",
                  flexShrink: 0,
                }}
              >
                ×
              </button>
            )}
          </div>
        </div>
        {similar.length > 0 && (
          <div
            style={{
              marginTop: 8,
              padding: "8px 11px",
              borderRadius: 8,
              background: "rgba(255,193,7,0.06)",
              border: "1px solid rgba(255,193,7,0.18)",
              fontSize: "0.70rem",
              lineHeight: 1.5,
            }}
          >
            <div style={{ fontWeight: 700, color: "rgba(255,193,7,0.80)", marginBottom: 4 }}>
              ⚠ This address may also be listed under a separate permit record:
            </div>
            {similar.map((s) => (
              <div key={s.eid} style={{ marginBottom: 3 }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSwitchTo?.(s.eid);
                  }}
                  style={{
                    background: "rgba(255,255,255,0.07)",
                    border: "1px solid rgba(255,255,255,0.14)",
                    borderRadius: 6,
                    color: "rgba(255,255,255,0.75)",
                    fontSize: "0.70rem",
                    fontWeight: 600,
                    padding: "2px 8px",
                    cursor: "pointer",
                    fontStyle: "italic",
                    transition: "background 0.15s, color 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.13)";
                    e.currentTarget.style.color = "#fff";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.07)";
                    e.currentTarget.style.color = "rgba(255,255,255,0.75)";
                  }}
                  title={`Switch to permit record: ${s.name}`}
                >
                  {s.name} →
                </button>
              </div>
            ))}
            <div
              style={{
                marginTop: 5,
                fontSize: "0.63rem",
                color: "rgba(255,255,255,0.30)",
                lineHeight: 1.4,
              }}
            >
              These are separate health department records shown independently. Inspection histories
              reflect each permit only. Data is displayed as received from Louisville Metro Health
              and has not been verified.
            </div>
          </div>
        )}
      </div>

      <div className="inspect-card_stats">
        <div className="inspect-stat">
          <div className={`inspect-badge ${badgeClass}`}>{scoreText}</div>
          <div className="inspect-stat_label">Score</div>
        </div>

        <div className="inspect-stat">
          <div className="inspect-date">{inspectionDate}</div>
          <div className="inspect-stat_label">{dateCaption ?? "Date"}</div>
        </div>

        <div className="inspect-stat">
          <div className={`inspect-pill ${gradeDisplay === "—" ? "muted" : ""}`}>
            {gradeDisplay}
          </div>
          <div className="inspect-stat_label">Grade</div>
        </div>
      </div>

      {hasDetails && (
        <>
          <div className="inspect-more-inline">
            <span>More info</span>
            <svg viewBox="0 0 24 24" width="16" height="16" className="chev" aria-hidden="true">
              <path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          </div>

          {open && (
            <div className="inspect-details">
              <div className="inspect-details-grid">
                {items.map((it) => (
                  <div className="detail-item" key={it.label}>
                    <div className="detail-label">{it.label}</div>
                    <div className="detail-value">{it.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ViolationRow({ v }) {
  const title = v.violation_desc || "Violation";
  const body = (v.insp_viol_comments || "").trim();
  const count = v._count || 1;
  const [open, setOpen] = React.useState(false);
  const maxLen = 240;
  const hasMore = body.length > maxLen;
  const shown = open || !hasMore ? body : body.slice(0, maxLen) + "…";

  return (
    <li className="viol-card">
      <div className="viol-rail" />
      <div className="viol-body">
        <div className="viol-header">
          <span className="viol-title">{title}</span>
          {count > 1 && <span className="viol-count-badge">×{count}</span>}
        </div>

        {shown && <div className="viol-text">{shown}</div>}

        {hasMore && (
          <button
            className="viol-toggle"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((x) => !x);
            }}
          >
            {open ? "Show less" : "Read more"}
          </button>
        )}
      </div>
    </li>
  );
}

function PastInspection({ row }) {
  const date = row.date_label ?? formatDateSafe(row.inspection_date);
  const gradeDisplay =
    row.grade && String(row.grade).trim().length > 0 ? String(row.grade).trim() : "—";

  const scoreNum =
    row.score != null && Number.isFinite(Number(row.score)) && Number(row.score) > 0
      ? Number(row.score)
      : null;

  const scoreText = scoreNum == null ? "N/A" : scoreNum;

  const badgeClass =
    scoreNum == null ? "na" : scoreNum >= 95 ? "ok" : scoreNum >= 85 ? "warn" : "bad";

  const rawViols = Array.isArray(row.violations) ? row.violations : [];
  // Deduplicate by violation_desc: same type cited multiple times (per food item) → one row + ×N count
  const byDesc = {};
  rawViols.forEach((v) => {
    const key = v.violation_desc || "Unknown";
    if (!byDesc[key]) {
      byDesc[key] = {
        ...v,
        _count: 1,
        _comments: v.insp_viol_comments ? [v.insp_viol_comments] : [],
      };
    } else {
      byDesc[key]._count++;
      const c = v.insp_viol_comments;
      if (c && !byDesc[key]._comments.includes(c)) byDesc[key]._comments.push(c);
    }
  });
  const viols = Object.values(byDesc).map((v) => ({
    ...v,
    insp_viol_comments: v._comments.join(" | "),
  }));

  const [open, setOpen] = React.useState(false);
  const showToggle = viols.length > 0;
  const list = viols;

  const listRef = useRef(null);
  const [maxH, setMaxH] = useState(0);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setMaxH(open ? el.scrollHeight : 0);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  return (
    <div className="hist-item">
      <div className="hist-head">
        <div className="hist-left">
          <div className={`hist-score ${badgeClass}`}>{scoreText}</div>
          <div className="hist-meta">
            <div className="hist-date">{date}</div>
            <div className="hist-type">{row.ins_type_desc || "Inspection"}</div>
          </div>
        </div>

        {/* The pill sits in a fixed-width column, so every row's pill is the same size and
            in the same place, however long the date is; an empty slot keeps the grade
            aligned when there are no violations. */}
        {viols.length === 0 && <span className="viol-count-slot" aria-hidden="true" />}
        {viols.length > 0 && (
          <button
            type="button"
            className={`viol-count ${open ? "open" : ""} ${showToggle ? "clickable" : ""}`}
            onClick={showToggle ? () => setOpen((x) => !x) : undefined}
            aria-expanded={open}
            title={
              showToggle
                ? open
                  ? "Collapse"
                  : `Show all ${rawViols.length}`
                : `${rawViols.length} violations`
            }
          >
            {rawViols.length} {rawViols.length === 1 ? "violation" : "violations"}
            {showToggle && (
              <span className="chev" aria-hidden="true">
                ▾
              </span>
            )}
          </button>
        )}

        <div className={`hist-grade ${gradeDisplay === "—" ? "muted" : ""}`}>{gradeDisplay}</div>
      </div>

      {viols.length > 0 && (
        <div className="viol-group">
          <div className="viol-group-header" />
          <div className={`viol-collapse ${open ? "open" : ""}`} style={{ maxHeight: maxH }}>
            <ul ref={listRef} className="viol-list">
              {row.violations_note && (
                <li className="viol-source-note" data-testid="violations-note">
                  {row.violations_note}
                </li>
              )}
              {list.map((v) => (
                <ViolationRow
                  key={v.violation_oid ?? `${row.inspection_id}-${v.violation_desc}`}
                  v={v}
                />
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function HistorySkeleton() {
  return (
    <div className="hist-skeleton">
      <div className="hist-skeleton-title">Inspection History</div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="hist-skeleton-row">
          <div className="skel-badge skel-pulse" />
          <div className="skel-lines">
            <div className="skel-line-a skel-pulse" />
            <div className="skel-line-b skel-pulse" />
          </div>
          <div className="skel-grade skel-pulse" />
        </div>
      ))}
    </div>
  );
}

function History({ rows, pins }) {
  if (!rows || rows.length === 0) return null;
  return (
    <div className="hist-wrap">
      <div className="hist-title">Inspection History</div>
      <div className="hist-list">
        {rows.map((r) => (
          <PastInspection
            key={r.inspection_id ?? `${r.establishment_id}-${r.inspection_date}`}
            row={r}
            pins={pins}
          />
        ))}
      </div>
    </div>
  );
}

const DRAWER_MIN_W = 360;
const DRAWER_MAX_W = 1100;

// rightOffset (desktop only): px to slide left so another right-hand panel (the account panel) can sit beside it.
export default function InfoDrawer({
  selected,
  drawerLoading,
  history,
  facDetails,
  pins,
  zIndex,
  onBringToFront,
  onSwitchTo,
  onClose,
  watchlisted,
  onSaveToWatchlist,
  rightOffset = 0,
  onSheetHeight,
}) {
  const isMobile = useMediaQuery("(max-width: 600px)");

  // ── Phone bottom sheet: rests at "peek" (card + about 1.5 history rows) or "expanded",
  // and can be dragged between them by its handle. Hooks stay above the early return.
  const sheetRef = React.useRef(null);
  const bodyRef = React.useRef(null);
  const gestureRef = React.useRef(null);
  const [snap, setSnap] = React.useState("peek");
  const [peekH, setPeekH] = React.useState(340);
  const [dragH, setDragH] = React.useState(null); // px while the handle is being dragged
  const [animate, setAnimate] = React.useState(false);
  const [vh, setVh] = React.useState(() =>
    typeof window !== "undefined" ? window.innerHeight : 800,
  );
  const hasSelected = !!selected;
  const eid = selected?.establishment_id;
  const expandedH = expandedHeight(vh);

  React.useEffect(() => {
    const onResize = () => setVh(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Every fresh open starts at peek.
  React.useEffect(() => {
    if (!hasSelected) {
      setSnap("peek");
      setDragH(null);
      setAnimate(false);
    }
  }, [hasSelected]);

  // Measure where the first history row sits, so peek shows exactly 1.5 rows.
  React.useLayoutEffect(() => {
    if (!isMobile || !hasSelected) return;
    const sheet = sheetRef.current;
    const body = bodyRef.current;
    if (!sheet || !body) return;
    const row = body.querySelector(".hist-item, .hist-skeleton-row");
    setPeekH(
      computePeekHeight({
        firstRowTop: row
          ? row.getBoundingClientRect().top - sheet.getBoundingClientRect().top + body.scrollTop
          : null,
        rowHeight: row ? row.offsetHeight : 0,
        viewportH: vh,
      }),
    );
    const id = requestAnimationFrame(() => setAnimate(true)); // no grow-in on first paint
    return () => cancelAnimationFrame(id);
  }, [isMobile, hasSelected, eid, history, drawerLoading, vh]);

  const restH = snap === "expanded" ? expandedH : peekH;
  const sheetH = dragH ?? restH;

  // Tell the parent the resting height (not every pixel of a drag).
  React.useEffect(() => {
    onSheetHeight?.(isMobile && hasSelected ? restH : 0);
  }, [onSheetHeight, isMobile, hasSelected, restH]);

  const onHandleDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const now = performance.now();
    gestureRef.current = {
      y0: e.clientY,
      h0: sheetRef.current ? sheetRef.current.getBoundingClientRect().height : restH,
      moved: false,
      lastY: e.clientY,
      lastT: now,
      v: 0,
      h: null,
    };
  };

  const onHandleMove = (e) => {
    const g = gestureRef.current;
    if (!g) return;
    const dy = g.y0 - e.clientY; // up is positive
    if (Math.abs(dy) > 6) g.moved = true;
    if (!g.moved) return;
    const now = performance.now();
    g.v = (g.lastY - e.clientY) / Math.max(1, now - g.lastT);
    g.lastY = e.clientY;
    g.lastT = now;
    g.h = clampSheetHeight(g.h0 + dy, peekH, expandedH);
    setDragH(g.h);
  };

  const onHandleUp = (e) => {
    const g = gestureRef.current;
    gestureRef.current = null;
    if (!g) return;
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      /* already released */
    }
    if (!g.moved) {
      setSnap((cur) => (cur === "peek" ? "expanded" : "peek")); // a tap toggles
      return;
    }
    const next = resolveSheetRelease({
      height: g.h ?? g.h0,
      velocity: g.v,
      snap,
      peekH,
      expandedH,
    });
    setDragH(null);
    if (next === "close") onClose?.();
    else setSnap(next);
  };

  // Horizontal resize — desktop only
  const defaultW = () => Math.min(420, Math.round(window.innerWidth * 0.82));
  const [drawerW, setDrawerW] = React.useState(defaultW);
  const dragRef = React.useRef({ on: false });

  const onLeftEdgeDown = React.useCallback(
    (e) => {
      e.preventDefault();
      dragRef.current = { on: true, x0: e.clientX, w0: drawerW };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [drawerW],
  );

  const onLeftEdgeMove = React.useCallback((e) => {
    if (!dragRef.current.on) return;
    const dx = dragRef.current.x0 - e.clientX; // drag left = wider
    setDrawerW(Math.max(DRAWER_MIN_W, Math.min(DRAWER_MAX_W, dragRef.current.w0 + dx)));
  }, []);

  const onLeftEdgeUp = React.useCallback(() => {
    dragRef.current.on = false;
  }, []);

  if (!selected) return null;

  // Mobile: bottom sheet with two resting heights (see above), dragged by its handle.
  // Desktop: full-height column between header and screen bottom, always scrollable.
  const outerStyle = isMobile
    ? {
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        height: sheetH,
        width: "100%",
        borderRadius: "14px 14px 0 0",
        transition: dragH != null || !animate ? "none" : "height .24s cubic-bezier(.2,.8,.2,1)",
      }
    : {
        position: "fixed",
        right: 16 + rightOffset,
        top: "calc(var(--header-h, var(--mobile-header-h, 64px)) + 10px)",
        bottom: 16,
        // Never run off the left edge when another panel is beside us
        width: Math.max(300, Math.min(drawerW, window.innerWidth - 16 - rightOffset - 24)),
        borderRadius: 12,
        transition: "right .24s ease",
      };

  return (
    <div
      ref={sheetRef}
      data-testid="info-drawer"
      className="info-drawer"
      onPointerDown={onBringToFront}
      style={{
        ...outerStyle,
        background: "rgba(18,18,22,0.97)",
        backdropFilter: "blur(8px)",
        color: "#fff",
        zIndex: zIndex ?? 3000,
        boxShadow: isMobile ? "0 -8px 32px rgba(0,0,0,0.55)" : "0 10px 30px rgba(0,0,0,0.4)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
      onPointerMove={!isMobile ? onLeftEdgeMove : undefined}
      onPointerUp={!isMobile ? onLeftEdgeUp : undefined}
      onPointerCancel={!isMobile ? onLeftEdgeUp : undefined}
    >
      {/* Left-edge resize handle — desktop only */}
      {!isMobile && (
        <div
          aria-hidden="true"
          onPointerDown={onLeftEdgeDown}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 8,
            cursor: "ew-resize",
            zIndex: 10,
            touchAction: "none",
            userSelect: "none",
            borderRadius: "12px 0 0 12px",
            background: "linear-gradient(to right, rgba(255,255,255,.10), transparent)",
            transition: "background .15s",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background =
              "linear-gradient(to right, rgba(255,255,255,.28), transparent)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background =
              "linear-gradient(to right, rgba(255,255,255,.10), transparent)")
          }
        />
      )}

      {/* Phone only: drag handle. Drag up to expand, down to collapse or close; a tap toggles. */}
      {isMobile && (
        <div
          data-testid="drawer-handle"
          role="button"
          tabIndex={0}
          aria-label={snap === "peek" ? "Expand details" : "Collapse details"}
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ")
              setSnap((cur) => (cur === "peek" ? "expanded" : "peek"));
          }}
          style={{
            flexShrink: 0,
            height: 26,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "grab",
            touchAction: "none",
            userSelect: "none",
          }}
        >
          <span
            style={{
              width: 40,
              height: 4,
              borderRadius: 999,
              background: "rgba(255,255,255,0.28)",
            }}
          />
        </div>
      )}

      {/* Veil removed — skeleton in history section serves as the loading indicator */}

      {/* Scrollable inner body.
          flex:1 + minHeight:0 lets it grow to fill on desktop (bounded by top+bottom),
          and on mobile sizes to content while still being scrollable if tall. */}
      <div
        ref={bodyRef}
        className="info-drawer-body"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          // Always reserve the scrollbar's space so the content width doesn't
          // change (and the name/address don't re-wrap) when "More info"
          // expands the body past the scroll threshold.
          scrollbarGutter: "stable",
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
          padding: isMobile ? "16px 16px 48px" : "24px 24px 60px",
        }}
      >
        <CurrentInspectionCard
          data={{
            establishment_id: selected.establishment_id,
            name: selected.name,
            address: selected.address,
            inspectionDate: selected.inspectionDate,
            score: selected.score,
            grade: selected.grade,
            meta: selected.meta,
            metaTitle: selected.metaTitle,
            similarNearby: selected.similarNearby,
            noLocation: selected.noLocation,
            sourceNote: selected.sourceNote,
            dateCaption: selected.dateCaption,
          }}
          details={facDetails}
          pins={pins}
          onSwitchTo={onSwitchTo}
          watchlisted={watchlisted}
          onSaveToWatchlist={onSaveToWatchlist}
          onClose={onClose}
        />

        <div className="inspect-card_spacer" />

        {/* History: show green-scan skeleton while loading, real rows once ready */}
        {drawerLoading && !history ? (
          <HistorySkeleton />
        ) : history ? (
          <History rows={history} pins={pins} />
        ) : null}
      </div>
    </div>
  );
}
