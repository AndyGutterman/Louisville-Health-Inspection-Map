// The county picker at the top of the filter panel: which county's pins the map shows.
// Counties' data differ (lib/regions.js `has`), so only one is shown at a time.
import "../../styles/CountyPicker.css";

export default function CountyPicker({ regions, value, onChange }) {
  return (
    <div className="county-picker">
      <span className="county-picker_label" id="county-picker-label">
        County
      </span>
      <div className="seg-toggle" role="radiogroup" aria-labelledby="county-picker-label">
        {regions.map((r) => (
          <button
            key={r.id}
            type="button"
            role="radio"
            aria-checked={value === r.id}
            data-testid={`county-${r.id}`}
            className={`seg-option ${value === r.id ? "checked" : ""}`}
            title={r.name}
            onClick={() => onChange(r.id)}
          >
            {r.shortName}
          </button>
        ))}
      </div>
    </div>
  );
}
