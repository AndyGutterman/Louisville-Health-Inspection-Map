// The Saved panel's form for a new watch area: an address, a label and a radius.
import AddressPicker from "../../AddressPicker.jsx";
import { WATCH_RADIUS_OPTIONS } from "../../watchAreaLayer.js";

export default function AddAreaForm({
  pickerKey,
  pick,
  setPick,
  areaLabel,
  setAreaLabel,
  areaRadius,
  setAreaRadius,
  addArea,
  saving,
}) {
  return (
    <div className="wl-add">
      <div className="wl-add-title">Add a watch area</div>
      <AddressPicker key={pickerKey} value={pick} onChange={setPick} inputClass="wl-input" />
      <div className="wl-add-opts">
        <input
          className="wl-input"
          placeholder="Label (optional)"
          maxLength={40}
          value={areaLabel}
          onChange={(e) => setAreaLabel(e.target.value)}
        />
        <div>
          <div className="wl-lbl">Radius</div>
          <div className="wl-seg">
            {WATCH_RADIUS_OPTIONS.map((r) => (
              <button
                key={r}
                className={areaRadius === r ? "on" : ""}
                onClick={() => setAreaRadius(r)}
              >
                {r} mi
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="wl-add-foot">
        <span className="wl-hint">
          {pick
            ? "Address confirmed. You can change the radius later."
            : "Choose an address from the dropdown to continue."}
        </span>
        <button className="wl-btn" onClick={addArea} disabled={!pick || saving}>
          {saving ? "Adding…" : "Add area"}
        </button>
      </div>
    </div>
  );
}
