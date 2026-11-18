import { countyStatusText } from "../../lib/counties.js";
import { useT } from "../../I18nContext.jsx";

// One row of the Filter tab's county list: a real checkbox, with what the county is doing.
export default function CountySwitch({ county: c, onToggle }) {
  const { t } = useT();
  return (
    <label
      className="county-switch"
      data-testid={`county-switch-${c.id}`}
      data-checked={c.shown}
      data-state={c.state ?? "idle"}
    >
      <input
        type="checkbox"
        checked={c.shown}
        onChange={(e) => onToggle?.(c.id, e.target.checked)}
      />
      <span className="county-switch-name">{c.name}</span>
      <span className="county-switch-status" aria-live="polite">
        {countyStatusText(c, t)}
      </span>
    </label>
  );
}
