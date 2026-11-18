// The open filter card's pin switches: one labelled row per colour on desktop, a compact
// row on phones.
import { useT } from "../../I18nContext.jsx";

export default function PinSwitches({
  isDesktop,
  showRedPins,
  setShowRedPins,
  showYellowPins,
  setShowYellowPins,
  showGreenPins,
  setShowGreenPins,
  showMissing,
  setShowMissing,
}) {
  const { t } = useT();
  return (
    <div className="rgb-toggles">
      {isDesktop ? (
        <>
          <div className="rgb-row">
            <span className="label">{t("filters.showRed")}</span>
            <label className="switch sm red">
              <input
                type="checkbox"
                checked={showRedPins}
                onChange={(e) => setShowRedPins(e.target.checked)}
              />
              <span />
            </label>
          </div>
          <div className="rgb-row">
            <span className="label">{t("filters.showYellow")}</span>
            <label className="switch sm yellow">
              <input
                type="checkbox"
                checked={showYellowPins}
                onChange={(e) => setShowYellowPins(e.target.checked)}
              />
              <span />
            </label>
          </div>
          <div className="rgb-row">
            <span className="label">{t("filters.showGreen")}</span>
            <label className="switch sm green">
              <input
                type="checkbox"
                checked={showGreenPins}
                onChange={(e) => setShowGreenPins(e.target.checked)}
              />
              <span />
            </label>
          </div>
          <div className="rgb-row">
            <span className="label">{t("filters.showUnscored")}</span>
            <label className="switch sm missing">
              <input
                type="checkbox"
                checked={showMissing}
                onChange={(e) => setShowMissing(e.target.checked)}
              />
              <span />
            </label>
          </div>
        </>
      ) : (
        <>
          <div className="rgb-inline">
            <label className="switch sm red" aria-label={t("filters.red")}>
              <input
                type="checkbox"
                checked={showRedPins}
                onChange={(e) => setShowRedPins(e.target.checked)}
              />
              <span />
            </label>
            <label className="switch sm yellow" aria-label={t("filters.yellow")}>
              <input
                type="checkbox"
                checked={showYellowPins}
                onChange={(e) => setShowYellowPins(e.target.checked)}
              />
              <span />
            </label>
            <label className="switch sm green" aria-label={t("filters.green")}>
              <input
                type="checkbox"
                checked={showGreenPins}
                onChange={(e) => setShowGreenPins(e.target.checked)}
              />
              <span />
            </label>
          </div>
          <div className="rgb-row">
            <span className="label">{t("filters.unscored")}</span>
            <label className="switch sm">
              <input
                type="checkbox"
                checked={showMissing}
                onChange={(e) => setShowMissing(e.target.checked)}
              />
              <span />
            </label>
          </div>
        </>
      )}
    </div>
  );
}
