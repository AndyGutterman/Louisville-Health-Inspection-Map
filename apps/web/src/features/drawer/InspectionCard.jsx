// The card at the top of the info drawer: name, address, score, date, grade, the save
// and close buttons, "may also be listed as", and the "More info" details.
import React from "react";
import { scoreBand } from "@lfs/core/grading.js";
import { useT } from "../../I18nContext.jsx";

const displayField = (v, notListed) =>
  v === null ? notListed : v === undefined || v === "" ? "—" : v;

export default function InspectionCard({
  data,
  details,
  onSwitchTo,
  watchlisted,
  onSaveToWatchlist,
  onClose,
}) {
  // Hooks must run on every render, so these sit above the early return.
  const [open, setOpen] = React.useState(false);
  const { t } = useT();
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
    showGrade = true,
  } = data;
  const gradeDisplay = grade && String(grade).trim().length > 0 ? String(grade).trim() : "—";
  const scoreNum =
    score != null && Number.isFinite(Number(score)) && Number(score) > 0 ? Number(score) : null;
  const badgeClass = scoreBand(scoreNum);

  const scoreText = scoreNum === 0 || scoreNum == null ? "N/A" : scoreNum;

  const items = details
    ? [
        {
          label: t("drawer.openingDate"),
          value: displayField(details.opening_date, t("drawer.notListed")),
        },
        {
          label: t("drawer.facilityType"),
          value: displayField(details.facility_type, t("drawer.notListed")),
        },
        { label: t("drawer.subtype"), value: displayField(details.subtype, t("drawer.notListed")) },
        {
          label: t("drawer.permit"),
          value: displayField(details.permit_number, t("drawer.notListed")),
        },
      ]
    : [];

  const hasDetails = items.some((i) => i.value && i.value !== "—");

  // similarNearby: [{eid, name}] — nearby permits that may represent the same place
  const similar = Array.isArray(similarNearby) ? similarNearby : [];

  // A click anywhere on the card opens "More info" (a mouse convenience). The card isn't a
  // button itself: it holds the save, close and "may also be listed as" buttons, and
  // controls inside a button can't be reached by a screen reader. The "More info" row
  // below is the real button, for the keyboard and screen readers.
  return (
    <div
      className={`inspect-card ${open ? "open" : ""}`}
      onClick={() => hasDetails && setOpen((v) => !v)}
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
                {t("drawer.noLocation")}
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
                aria-label={t(watchlisted ? "popup.unsave" : "popup.save")}
                title={t(watchlisted ? "popup.unsave" : "popup.save")}
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
                aria-label={t("drawer.close")}
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
              ⚠ {t("drawer.alsoListed")}
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
                  title={t("drawer.switchTo", { name: s.name })}
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
              {t("drawer.separateRecords")}
            </div>
          </div>
        )}
      </div>

      <div className="inspect-card_stats">
        <div className="inspect-stat">
          <div className={`inspect-badge ${badgeClass}`}>{scoreText}</div>
          <div className="inspect-stat_label">{t("drawer.score")}</div>
        </div>

        <div className="inspect-stat">
          <div className="inspect-date">{inspectionDate}</div>
          <div className="inspect-stat_label">{dateCaption ?? t("drawer.date")}</div>
        </div>

        {showGrade && (
          <div className="inspect-stat">
            <div className={`inspect-pill ${gradeDisplay === "—" ? "muted" : ""}`}>
              {gradeDisplay}
            </div>
            <div className="inspect-stat_label">{t("drawer.grade")}</div>
          </div>
        )}
      </div>

      {hasDetails && (
        <>
          <button
            type="button"
            className="inspect-more-inline"
            aria-expanded={open}
            aria-controls="inspect-details"
            onClick={(e) => {
              e.stopPropagation(); // the card's own click would toggle it straight back
              setOpen((v) => !v);
            }}
          >
            <span>{t("drawer.moreInfo")}</span>
            <svg viewBox="0 0 24 24" width="16" height="16" className="chev" aria-hidden="true">
              <path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>

          {open && (
            <div className="inspect-details" id="inspect-details">
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
