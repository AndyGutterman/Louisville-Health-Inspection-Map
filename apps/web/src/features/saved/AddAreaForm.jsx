// The Saved panel's form for a new watch area: an address, a label and a radius.
import { useT } from "../../I18nContext.jsx";
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
  const { t } = useT();
  return (
    <div className="wl-add">
      <div className="wl-add-title">{t("saved.add.title")}</div>
      <AddressPicker key={pickerKey} value={pick} onChange={setPick} inputClass="wl-input" />
      <div className="wl-add-opts">
        <input
          className="wl-input"
          placeholder={t("saved.add.label")}
          maxLength={40}
          value={areaLabel}
          onChange={(e) => setAreaLabel(e.target.value)}
        />
        <div>
          <div className="wl-lbl">{t("saved.add.radius")}</div>
          <div className="wl-seg">
            {WATCH_RADIUS_OPTIONS.map((r) => (
              <button
                key={r}
                className={areaRadius === r ? "on" : ""}
                onClick={() => setAreaRadius(r)}
              >
                {t("saved.miles", { n: r })}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="wl-add-foot">
        <span className="wl-hint">{pick ? t("saved.add.confirmed") : t("saved.add.choose")}</span>
        <button className="wl-btn" onClick={addArea} disabled={!pick || saving}>
          {saving ? t("saved.add.adding") : t("saved.add.submit")}
        </button>
      </div>
    </div>
  );
}
