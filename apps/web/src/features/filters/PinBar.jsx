// The top row of the filter card, always showing: a switch per pin colour (and the
// unscored pins), and the "Since" date picker.
import * as Switch from "@radix-ui/react-switch";
import { useT } from "../../I18nContext.jsx";

export default function PinBar({
  showRedPins,
  setShowRedPins,
  showYellowPins,
  setShowYellowPins,
  showGreenPins,
  setShowGreenPins,
  showMissing,
  setShowMissing,
  dateFilterKey,
  setDateFilterKey,
  dateFilterOpts,
}) {
  const { t } = useT();
  return (
    <div className="rgb-compact" role="group" aria-label={t("filters.showPins")}>
      <div className="tog-item">
        <Switch.Root
          className="rx-switch xs red"
          checked={showRedPins}
          onCheckedChange={setShowRedPins}
          aria-label={t("filters.showRedPins")}
        >
          <Switch.Thumb className="rx-thumb" />
        </Switch.Root>
        <span className="tog-lbl" style={{ color: "#ef4444" }}>
          {t("filters.red")}
        </span>
      </div>
      <div className="tog-item">
        <Switch.Root
          className="rx-switch xs yellow"
          checked={showYellowPins}
          onCheckedChange={setShowYellowPins}
          aria-label={t("filters.showYellowPins")}
        >
          <Switch.Thumb className="rx-thumb" />
        </Switch.Root>
        <span className="tog-lbl" style={{ color: "#f59e0b" }}>
          {t("filters.yellow")}
        </span>
      </div>
      <div className="tog-item">
        <Switch.Root
          className="rx-switch xs green"
          checked={showGreenPins}
          onCheckedChange={setShowGreenPins}
          aria-label={t("filters.showGreenPins")}
        >
          <Switch.Thumb className="rx-thumb" />
        </Switch.Root>
        <span className="tog-lbl" style={{ color: "#22c55e" }}>
          {t("filters.green")}
        </span>
      </div>
      <div className="tog-item">
        <Switch.Root
          className="rx-switch xs purple"
          checked={showMissing}
          onCheckedChange={setShowMissing}
          aria-label={t("filters.showUnscoredPins")}
        >
          <Switch.Thumb className="rx-thumb" />
        </Switch.Root>
        <span className="tog-lbl" style={{ color: "#888" }}>
          {t("filters.na")}
        </span>
      </div>

      {/* Date range filter — compact horizontal "Since" pill */}
      {dateFilterOpts && (
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            marginLeft: 6,
            borderLeft: "1px solid rgba(255,255,255,0.10)",
            paddingLeft: 8,
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgba(255,255,255,0.40)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={{ flexShrink: 0 }}
          >
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
          <select
            value={dateFilterKey}
            onChange={(e) => setDateFilterKey(e.target.value)}
            aria-label={t("filters.dateLabel")}
            title={t("filters.dateTitle")}
            style={{
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 6,
              color: "#f0f0f3",
              fontSize: ".72rem",
              fontWeight: 600,
              padding: "3px 20px 3px 6px",
              cursor: "pointer",
              appearance: "none",
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.40)' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 5px center",
              fontFamily: "inherit",
              height: 26,
              lineHeight: 1,
            }}
          >
            {dateFilterOpts.map((opt) => (
              <option key={opt.key} value={opt.key} style={{ background: "#1a1a1e" }}>
                {opt.labelKey ? t(opt.labelKey) : opt.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
