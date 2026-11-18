// One place in a watch area's list: name, address, distance, score, date, violations.
import { scoreBand } from "@lfs/core/grading.js";
import { formatLongDate } from "../../lib/dates.js";
import { useT } from "../../I18nContext.jsx";
import { violationText } from "../../lib/watchAreaSort.js";

export default function PlaceRow({ p, active, onOpen }) {
  const { t, locale } = useT();
  return (
    <div
      className={`wl-place${p.failing ? " fail" : ""}${active ? " active" : ""}${onOpen ? " wl-click" : ""}`}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen ? () => onOpen(p) : undefined}
      onKeyDown={
        onOpen
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen(p);
              }
            }
          : undefined
      }
    >
      <div className="wl-place-main">
        <div className="wl-place-name">{p.name}</div>
        <div className="wl-place-addr">
          {p.address}
          {p.distance_mi != null && ` · ${t("saved.miles", { n: p.distance_mi })}`}
        </div>
      </div>
      <div className="wl-place-side">
        <div className={`wl-place-score ${scoreBand(p.score)}`}>
          {p.score ? p.score : t("saved.place.na")}
          {p.grade ? ` · ${p.grade}` : ""}
        </div>
        {p.inspection_date && (
          <div className="wl-place-date">{formatLongDate(p.inspection_date, locale)}</div>
        )}
        {p.violations_6mo > 0 && <div className="wl-viol">{violationText(p, t)}</div>}
      </div>
    </div>
  );
}
