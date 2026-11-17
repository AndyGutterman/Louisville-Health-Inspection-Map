// One place in a watch area's list: name, address, distance, score, date, violations.
import { scoreBand } from "@lfs/core/grading.js";
import { formatLongDate } from "../../lib/dates.js";
import { violationText } from "../../lib/watchAreaSort.js";

export default function PlaceRow({ p, active, onOpen }) {
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
          {p.distance_mi != null && ` · ${p.distance_mi} mi`}
        </div>
      </div>
      <div className="wl-place-side">
        <div className={`wl-place-score ${scoreBand(p.score)}`}>
          {p.score ? p.score : "N/A"}
          {p.grade ? ` · ${p.grade}` : ""}
        </div>
        {p.inspection_date && (
          <div className="wl-place-date">{formatLongDate(p.inspection_date)}</div>
        )}
        {p.violations_6mo > 0 && <div className="wl-viol">{violationText(p)}</div>}
      </div>
    </div>
  );
}
