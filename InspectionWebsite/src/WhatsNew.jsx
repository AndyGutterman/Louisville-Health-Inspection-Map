import React, { useState, useEffect, useRef, useCallback } from "react";

const STYLES = `
/* ── Collapsed trigger button ── */
.wn-trigger {
  position: fixed;
  bottom: 58px;
  left: 16px;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(18,18,22,0.94);
  border: 1px solid rgba(255,255,255,0.10);
  box-shadow: 0 4px 16px rgba(0,0,0,0.40);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 2800;
  transition: border-color .15s, background .15s, box-shadow .15s;
  backdrop-filter: blur(6px);
}
.wn-trigger:hover {
  border-color: rgba(255,255,255,0.20);
  background: rgba(24,24,30,0.98);
  box-shadow: 0 6px 20px rgba(0,0,0,0.50);
}
.wn-trigger-icon {
  width: 20px; height: 20px;
  opacity: 0.50;
  transition: opacity .15s;
}
.wn-trigger:hover .wn-trigger-icon { opacity: 0.72; }

/* ── Expanded panel ── */
.wn-panel {
  position: fixed;
  bottom: 58px;
  left: 16px;
  width: var(--wn-w, 320px);
  background: rgba(18,18,22,0.97);
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: 14px;
  color: #f0f0f3;
  font-family: "Helvetica Neue", Arial, sans-serif;
  box-shadow: 0 10px 32px rgba(0,0,0,0.50);
  z-index: 2800;
  display: flex;
  flex-direction: column;
  max-height: 68dvh;
  overflow: hidden;
  backdrop-filter: blur(8px);
}
.wn-header {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 11px 12px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  flex-shrink: 0;
  cursor: default;
}
.wn-title {
  font-size: .78rem;
  font-weight: 800;
  letter-spacing: .05em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.60);
  flex: 1;
}
.wn-close {
  background: transparent;
  border: none;
  color: rgba(255,255,255,0.28);
  font-size: 16px;
  cursor: pointer;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 6px;
  transition: color .12s, background .12s;
}
.wn-close:hover { color: rgba(255,255,255,0.70); background: rgba(255,255,255,0.07); }
.wn-body {
  overflow-y: auto;
  flex: 1;
  padding: 6px 0;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}
.wn-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 9px 13px;
  cursor: pointer;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  transition: background .12s;
}
.wn-card:last-child { border-bottom: none; }
.wn-card:hover { background: rgba(255,255,255,0.04); }
.wn-badge {
  flex-shrink: 0;
  width: 34px; height: 34px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: .80rem;
  font-weight: 800;
}
.wn-badge.ok   { background: rgba(52,168,83,0.14);  color: #6fcf8a; border: 1px solid rgba(52,168,83,0.25); }
.wn-badge.warn { background: rgba(251,188,5,0.11);  color: #e8ae00; border: 1px solid rgba(251,188,5,0.25); }
.wn-badge.bad  { background: rgba(234,67,53,0.13);  color: #ff9a9a; border: 1px solid rgba(234,67,53,0.25); }
.wn-badge.na   { background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.32); border: 1px solid rgba(255,255,255,0.09); }
.wn-info { flex: 1; min-width: 0; }
.wn-name {
  font-size: .82rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: rgba(255,255,255,0.88);
}
.wn-sub {
  font-size: .68rem;
  color: rgba(255,255,255,0.36);
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wn-crit {
  font-size: .62rem;
  font-weight: 800;
  letter-spacing: .05em;
  text-transform: uppercase;
  color: rgba(234,67,53,0.70);
  margin-top: 3px;
}
.wn-more {
  width: 100%;
  padding: 8px;
  background: transparent;
  border: none;
  border-top: 1px solid rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.36);
  font-size: .72rem;
  font-weight: 600;
  cursor: pointer;
  text-align: center;
  flex-shrink: 0;
  transition: background .12s, color .12s;
}
.wn-more:hover { background: rgba(255,255,255,0.03); color: rgba(255,255,255,0.60); }
.wn-empty {
  padding: 20px 14px;
  text-align: center;
  font-size: .78rem;
  color: rgba(255,255,255,0.28);
  line-height: 1.5;
}
.wn-loading { padding: 20px 14px; text-align: center; font-size: .78rem; color: rgba(255,255,255,0.28); }
.wn-error   { padding: 20px 14px; text-align: center; font-size: .74rem; color: rgba(234,67,53,0.55); }

/* Right-edge resize handle */
.wn-resize-r {
  position: absolute;
  right: 0; top: 0; bottom: 0;
  width: 5px;
  cursor: ew-resize;
  z-index: 10;
  border-radius: 0 14px 14px 0;
}
.wn-resize-r:hover { background: rgba(255,255,255,0.08); }

@media (max-width: 599px) {
  .wn-trigger { bottom: 60px; left: 12px; }
  .wn-panel { left: 8px; right: 8px; width: auto !important; bottom: 112px; }
}
`;

function FlameIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M12 2C12 2 8 6 8 10C8 10 6 9 6 7C6 7 3 11 3 14C3 18.418 7.134 22 12 22C16.866 22 21 18.418 21 14C21 10 17 6 12 2Z"
        fill="currentColor"
        opacity="0.7"
      />
      <path
        d="M12 14C12 14 10 12.5 10 11C10 11 11 12 12 12C13 12 14.5 10.5 14 8C14 8 16 10 16 13C16 15.209 14.209 17 12 17C9.791 17 8 15.209 8 13"
        fill="rgba(255,255,255,0.25)"
      />
    </svg>
  );
}

function formatDate(val) {
  if (!val) return "";
  const m = String(val).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString(undefined, {
      timeZone: "UTC", month: "short", day: "numeric",
    });
  }
  return String(val);
}

export default function WhatsNew({ supabase, onOpenEstablishment, open, onClose, onOpen }) {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [panelW, setPanelW]   = useState(320);
  const dragRef = useRef({ on: false });
  const loadedRef = useRef(false);

  const isMobile = typeof window !== "undefined" && window.innerWidth < 600;

  useEffect(() => {
    if (!open || !supabase || loadedRef.current) return;
    loadedRef.current = true;
    setLoading(true);
    setLoadError(null);
    supabase.rpc("get_whats_new", { limit_n: 20 }).then(({ data, error }) => {
      if (error) {
        console.warn("[WhatsNew] RPC error:", error.message);
        setLoadError(error.message);
      } else {
        setItems(data || []);
      }
      setLoading(false);
    });
  }, [open, supabase]);

  const onResizeDown = useCallback((e) => {
    e.preventDefault();
    dragRef.current = { on: true, x0: e.clientX, w0: panelW };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [panelW]);

  const onResizeMove = useCallback((e) => {
    if (!dragRef.current.on) return;
    setPanelW(Math.max(240, Math.min(520, dragRef.current.w0 + (e.clientX - dragRef.current.x0))));
  }, []);

  const onResizeUp = useCallback(() => { dragRef.current.on = false; }, []);

  if (!open) {
    return (
      <>
        <style>{STYLES}</style>
        <button
          className="wn-trigger"
          onClick={onOpen}
          aria-label="What's New"
          title="What's New"
        >
          <FlameIcon className="wn-trigger-icon" />
        </button>
      </>
    );
  }

  const visible = showAll ? items : items.slice(0, 5);

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
        {!isMobile && (
          <div className="wn-resize-r" aria-hidden="true" onPointerDown={onResizeDown} />
        )}

        <div className="wn-header">
          <FlameIcon className="wn-trigger-icon" style={{ width: 14, height: 14, opacity: 0.50 }} />
          <div className="wn-title">What's New</div>
          <button className="wn-close" onClick={onClose} aria-label="Close What's New">×</button>
        </div>

        <div className="wn-body">
          {loading ? (
            <div className="wn-loading">Loading…</div>
          ) : loadError ? (
            <div className="wn-error">
              Could not load recent inspections.<br />
              <span style={{ fontSize: ".68rem", opacity: .7 }}>
                (Run the get_whats_new migration in Supabase first)
              </span>
            </div>
          ) : items.length === 0 ? (
            <div className="wn-empty">No inspections in the last 30 days.</div>
          ) : (
            visible.map((item, i) => {
              const score = item.score;
              const badgeClass =
                score == null || score === 0 ? "na"
                : score < 85 ? "bad"
                : score < 95 ? "warn"
                : "ok";

              return (
                <div
                  key={`${item.establishment_id}-${i}`}
                  className="wn-card"
                  onClick={() => onOpenEstablishment?.(item.establishment_id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onOpenEstablishment?.(item.establishment_id); }}
                >
                  <div className={`wn-badge ${badgeClass}`}>
                    {score == null || score === 0 ? "–" : score}
                  </div>
                  <div className="wn-info">
                    <div className="wn-name">{item.premise_name || item.establishment_id}</div>
                    <div className="wn-sub">
                      {[item.address, formatDate(item.inspection_date)].filter(Boolean).join(" · ")}
                    </div>
                    {item.critical_count > 0 && (
                      <div className="wn-crit">
                        {item.critical_count} critical {item.critical_count === 1 ? "violation" : "violations"}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {!loading && !loadError && items.length > 5 && (
          <button className="wn-more" onClick={() => setShowAll(v => !v)}>
            {showAll ? "Show fewer" : `Show all ${items.length}`}
          </button>
        )}
      </div>
    </>
  );
}
