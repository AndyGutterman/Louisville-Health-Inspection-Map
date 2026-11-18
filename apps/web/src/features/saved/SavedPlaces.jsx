// The Saved panel's list of saved places, each with its latest score and a Remove button.
import { scoreBand } from "@lfs/core/grading.js";
import { formatLongDate } from "../../lib/dates.js";
import { violationText } from "../../lib/watchAreaSort.js";
import { CAPS } from "./limits.js";

export default function SavedPlaces({
  items,
  activeEid,
  onOpenEstablishment,
  openRow,
  removeItem,
}) {
  return (
    <div className="wl-section">
      <div className="wl-section-hd">
        <h3>Saved restaurants</h3>
        <span className="wl-usage">
          {items.length} / {CAPS.places}
        </span>
      </div>
      {items.length === 0 ? (
        <div className="wl-empty">Click any map pin, then save it here.</div>
      ) : (
        <div className="wl-list">
          {items.map((item) => (
            <div
              key={item.id}
              className={`wl-item${activeEid && activeEid === item.establishment_id ? " active" : ""}`}
            >
              <div className="wl-row">
                <div
                  className={`wl-grow${onOpenEstablishment ? " wl-click" : ""}`}
                  role={onOpenEstablishment ? "button" : undefined}
                  tabIndex={onOpenEstablishment ? 0 : undefined}
                  onClick={onOpenEstablishment ? () => openRow(item) : undefined}
                  onKeyDown={
                    onOpenEstablishment
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openRow(item);
                          }
                        }
                      : undefined
                  }
                >
                  <div className="wl-name">{item.name}</div>
                  <div className="wl-sub">
                    {[item.address, item.city].filter(Boolean).join(", ")}
                  </div>
                  <div className={`wl-score ${scoreBand(item.score)}`}>
                    {item.score ? `Score ${item.score}` : "Score N/A"}
                    {item.grade ? ` · Grade ${item.grade}` : ""}
                    {item.inspection_date && (
                      <span className="dt"> · {formatLongDate(item.inspection_date)}</span>
                    )}
                    {item.violations_6mo > 0 && (
                      <div className="wl-viol" style={{ marginTop: 3 }}>
                        {violationText(item)}
                      </div>
                    )}
                  </div>
                </div>
                <button className="wl-remove" onClick={() => removeItem(item.id)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
