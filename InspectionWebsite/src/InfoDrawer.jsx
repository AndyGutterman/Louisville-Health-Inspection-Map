import React, { useEffect, useRef, useState } from "react";
import "./styles/Violations.css";
import "./styles/History.css";
import './styles/RestaurantInfo.css';

function formatDateSafe(val) {
  if (!val) return "n/a";
  if (typeof val === "string") {
    const m = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
      return d.toLocaleDateString(undefined, { timeZone: "UTC" });
    }
  }
  try {
    const d = new Date(val);
    return isNaN(d.getTime()) ? String(val) : d.toLocaleDateString();
  } catch {
    return String(val);
  }
}

const displayField = (v) =>
  v === null ? "not listed" : v === undefined || v === "" ? "—" : v;

function CurrentInspectionCard({ data, details }) {
  if (!data) return null;
  const { name, address, inspectionDate, score, grade, meta, metaTitle } = data;
  const gradeDisplay =
    grade && String(grade).trim().length > 0 ? String(grade).trim() : "—";
  const scoreNum = score != null && Number.isFinite(Number(score)) && Number(score) > 0
  ? Number(score)
  : null;
  const badgeClass =
    scoreNum == null
      ? "na"
      : scoreNum >= 95
        ? "ok"
        : scoreNum >= 85
          ? "warn"
          : "bad";

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
  const [open, setOpen] = React.useState(false);

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
        <div className="inspect-card_title">{name}</div>
        <div className="inspect-card_sub">{address}</div>
      </div>

      <div className="inspect-card_stats">
        <div className="inspect-stat">
          <div className={`inspect-badge ${badgeClass}`}>{scoreText}</div>
          <div className="inspect-stat_label">Score</div>
        </div>

        <div className="inspect-stat">
          <div className="inspect-date">{inspectionDate}</div>
          <div className="inspect-stat_label">Date</div>
        </div>

        <div className="inspect-stat">
          <div
            className={`inspect-pill ${gradeDisplay === "—" ? "muted" : ""}`}
          >
            {gradeDisplay}
          </div>
          <div className="inspect-stat_label">Grade</div>
        </div>
      </div>

      {hasDetails && (
        <>
          <div className="inspect-more-inline">
            <span>More info</span>
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              className="chev"
              aria-hidden="true"
            >
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
  const yn = String(v.critical_yn || "").trim().toLowerCase();
  const isCrit =
    yn === "y" || yn === "yes" || yn === "true" || yn === "t" || yn === "1";
  const title = v.violation_desc || "Violation";
  const body = (v.insp_viol_comments || "").trim();
  const [open, setOpen] = React.useState(false);
  const maxLen = 240;
  const hasMore = body.length > maxLen;
  const shown = open || !hasMore ? body : body.slice(0, maxLen) + "…";

  return (
    <li className={`viol-card ${isCrit ? "crit" : ""}`}>
      <div className="viol-rail" />
      <div className="viol-body">
        <div className="viol-header">
          {isCrit && <span className="viol-chip crit">Critical</span>}
          <span className="viol-title">{title}</span>
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
  const date = formatDateSafe(row.inspection_date);
  const gradeDisplay =
    row.grade && String(row.grade).trim().length > 0
      ? String(row.grade).trim()
      : "—";

  const scoreNum = row.score != null && Number.isFinite(Number(row.score)) && Number(row.score) > 0
    ? Number(row.score)
    : null;

  const scoreText = scoreNum == null ? "N/A" : scoreNum;

  const badgeClass =
    scoreNum == null
      ? "na"
      : scoreNum >= 95
        ? "ok"
        : scoreNum >= 85
          ? "warn"
          : "bad";

  const rawViols = Array.isArray(row.violations) ? row.violations : [];
  const isCrit = (v) => {
    const yn = String(v.critical_yn || "").trim().toLowerCase();
    return yn === "y" || yn === "yes" || yn === "true" || yn === "t" || yn === "1";
  };
  const viols = [...rawViols].sort(
    (a, b) => (isCrit(b) ? 1 : 0) - (isCrit(a) ? 1 : 0),
  );

  const [open, setOpen] = React.useState(false);
  const showToggle = viols.length > 0;
  const list = viols;
  const anyCrit = viols.some(isCrit);

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

        {viols.length > 0 && (
          <button
            type="button"
            className={`viol-count ${anyCrit ? "crit" : ""} ${open ? "open" : ""} ${showToggle ? "clickable" : ""}`}
            onClick={showToggle ? () => setOpen((x) => !x) : undefined}
            aria-expanded={open}
            title={
              showToggle
                ? open
                  ? "Collapse"
                  : `Show all ${viols.length}`
                : `${viols.length} violations`
            }
          >
            {viols.length} {viols.length === 1 ? "violation" : "violations"}
            {showToggle && <span className="chev" aria-hidden="true">▾</span>}
          </button>
        )}

        <div className={`hist-grade ${gradeDisplay === "—" ? "muted" : ""}`}>
          {gradeDisplay}
        </div>
      </div>

      {viols.length > 0 && (
        <div className="viol-group">
          <div className="viol-group-header" />
          <div className={`viol-collapse ${open ? "open" : ""}`} style={{ maxHeight: maxH }}>
            <ul ref={listRef} className="viol-list">
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

function History({ rows }) {
  if (!rows || rows.length === 0) return null;
  return (
    <div className="hist-wrap">
      <div className="hist-title">Inspection History</div>
      <div className="hist-list">
        {rows.map((r) => (
          <PastInspection
            key={r.inspection_id ?? `${r.establishment_id}-${r.inspection_date}`}
            row={r}
          />
        ))}
      </div>
    </div>
  );
}

function useIsMobile() {
  const get = () => typeof window !== "undefined" && window.matchMedia("(max-width: 600px)").matches;
  const [mobile, setMobile] = React.useState(get);
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 600px)");
    const onChange = () => setMobile(mq.matches);
    try { mq.addEventListener("change", onChange); } catch { mq.addListener(onChange); }
    return () => { try { mq.removeEventListener("change", onChange); } catch { mq.removeListener(onChange); } };
  }, []);
  return mobile;
}

export default function InfoDrawer({ selected, drawerLoading, history, facDetails, onClose }) {
  const isMobile = useIsMobile();
  if (!selected) return null;

  // Mobile: bottom sheet, auto-heights to content (up to 82dvh), slides up from bottom.
  // Desktop: full-height column between header and screen bottom, always scrollable.
  const outerStyle = isMobile ? {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "82dvh",
    width: "100%",
    borderRadius: "14px 14px 0 0",
  } : {
    position: "fixed",
    right: 16,
    top: "calc(var(--header-h, var(--mobile-header-h, 64px)) + 10px)",
    bottom: 16,
    width: "min(520px, 92vw)",
    borderRadius: 12,
  };

  return (
    <div
      className="info-drawer"
      style={{
        ...outerStyle,
        background: "rgba(24,24,24,0.96)",
        backdropFilter: "blur(6px)",
        color: "#fff",
        zIndex: 3000,
        boxShadow: isMobile
          ? "0 -8px 32px rgba(0,0,0,0.55)"
          : "0 10px 30px rgba(0,0,0,0.4)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Drag pill on mobile */}
      {isMobile && (
        <div aria-hidden="true" style={{
          width: 36, height: 4, borderRadius: 999,
          background: "rgba(255,255,255,.28)",
          margin: "10px auto 2px",
          flexShrink: 0,
        }} />
      )}

      {/* Close — always above scroll */}
      <button className="info-close" onClick={onClose} aria-label="Close">×</button>

      {/* Loading veil */}
      <div className={`drawer-veil ${drawerLoading ? "show" : ""}`} />

      {/* Scrollable inner body.
          flex:1 + minHeight:0 lets it grow to fill on desktop (bounded by top+bottom),
          and on mobile sizes to content while still being scrollable if tall. */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
          padding: isMobile ? "16px 16px 48px" : "24px 24px 60px",
        }}
      >
        <CurrentInspectionCard
          data={{
            name: selected.name,
            address: selected.address,
            inspectionDate: selected.inspectionDate,
            score: selected.score,
            grade: selected.grade,
            meta: selected.meta,
            metaTitle: selected.metaTitle,
          }}
          details={facDetails}
        />

        <div className="inspect-card_spacer" />

        {history && <History rows={history} />}
      </div>

      {/* Bottom fade — signals scrollable content below */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 52,
          background: `linear-gradient(to bottom, transparent, rgba(24,24,24,0.97))`,
          borderRadius: isMobile ? 0 : "0 0 12px 12px",
          pointerEvents: "none",
          zIndex: 4,
        }}
      />
    </div>
  );
}