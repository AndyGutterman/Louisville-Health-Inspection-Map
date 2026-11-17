// The info drawer's inspection history: one row per inspection, each opening to its
// violations, and the skeleton shown while it loads.
import React, { useEffect, useRef, useState } from "react";
import { scoreBand } from "@lfs/core/grading.js";
import { formatDateSafe } from "../../lib/dates.js";
import { groupViolations } from "../../lib/violationGroups.js";

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

function PastInspection({ row, showGrade = true }) {
  const date = row.date_label ?? formatDateSafe(row.inspection_date);
  const gradeDisplay =
    row.grade && String(row.grade).trim().length > 0 ? String(row.grade).trim() : "—";

  const scoreNum =
    row.score != null && Number.isFinite(Number(row.score)) && Number(row.score) > 0
      ? Number(row.score)
      : null;

  const scoreText = scoreNum == null ? "N/A" : scoreNum;

  const badgeClass = scoreBand(scoreNum);

  const rawViols = Array.isArray(row.violations) ? row.violations : [];
  // The same kind of violation cited several times (once per food item) is one row, ×N.
  const viols = groupViolations(rawViols);

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

        {showGrade && (
          <div className={`hist-grade ${gradeDisplay === "—" ? "muted" : ""}`}>{gradeDisplay}</div>
        )}
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

export function HistorySkeleton() {
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

export default function History({ rows, pins, showGrade = true }) {
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
            showGrade={showGrade}
          />
        ))}
      </div>
    </div>
  );
}
