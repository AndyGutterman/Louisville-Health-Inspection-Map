import React from "react";
import * as Tabs from "@radix-ui/react-tabs";

function useMedia(query) {
  const get = () =>
    typeof window !== "undefined" && window.matchMedia(query).matches;
  const [match, setMatch] = React.useState(get);
  React.useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatch(mq.matches);
    try {
      mq.addEventListener("change", onChange);
    } catch {
      mq.addListener(onChange);
    }
    return () => {
      try {
        mq.removeEventListener("change", onChange);
      } catch {
        mq.removeListener(onChange);
      }
    };
  }, [query]);
  return match;
}

function CompactSwitch({ checked, onChange, color }) {
  const W = 44, H = 24, PAD = 3, KNOB = H - PAD * 2;
  const x = checked ? W - PAD - KNOB : PAD;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        position: "relative",
        width: W,
        height: H,
        borderRadius: H / 2,
        background: checked ? color : "rgba(255,255,255,0.14)",
        border: "1px solid rgba(255,255,255,0.12)",
        cursor: "pointer",
        display: "inline-block",
        padding: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          left: x,
          top: PAD,
          width: KNOB,
          height: KNOB,
          borderRadius: KNOB / 2,
          background: "#0e0e10",
          boxShadow: "0 0 0 1px rgba(255,255,255,0.06), 0 1px 2px rgba(0,0,0,0.6)",
        }}
      />
    </button>
  );
}

function Icon({ k, active }) {
  const stroke = active ? "var(--tile-accent, #5aa8ff)" : "rgba(255,255,255,.45)";
  const fill   = active ? "var(--tile-accent, #5aa8ff)" : "rgba(255,255,255,.35)";
  const common = { width: 26, height: 26, viewBox: "0 0 24 24", "aria-hidden": true };

  switch (k) {
    case "restaurants":
    return (
        <svg {...common} fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 4v5M9 4v5M8 4v14" />
        <path d="M16 4c0 2-2 3-2 5v9" />
        </svg>
    );



    case "daycare":
      return (
        <svg {...common} fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="9" r="3" />
          <path d="M9 12v5m-3 0h6" />
          <circle cx="16" cy="16" r="2" />
          <path d="M18 18l3 3" />
        </svg>
      );
    case "hospitals":
      return (
        <svg {...common} fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M12 7v10M8 12h8" />
        </svg>
      );
    case "schools":
      return (
        <svg {...common} fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 10l9-5 9 5-9 5-9-5z" />
          <path d="M7 12v4l5 3 5-3v-4" />
        </svg>
      );
    case "concessions":
    return (
        <svg {...common} fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 9h8l-1.2 8H9.2z" />
        <path d="M10 10v7M12 10v7M14 10v7" />
        <circle cx="10" cy="8.4" r="1" fill={active ? fill : "transparent"} />
        <circle cx="12.6" cy="7.9" r="1" fill={active ? fill : "transparent"} />
        <circle cx="15" cy="8.6" r="1" fill={active ? fill : "transparent"} />
        </svg>
    );
    case "mobile":
    return (
        <svg {...common} fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {/* body */}
        <rect x="3" y="10" width="13" height="7" rx="2" />
        {/* cab */}
        <path d="M16 12h3v5h-4" />
        {/* window + small awning */}
        <rect x="6" y="11" width="6" height="3" rx="1" />
        <path d="M6 11l1-2h6l1 2" />
        {/* wheels */}
        <circle cx="8" cy="18" r="2" fill={active ? fill : "transparent"} />
        <circle cx="16" cy="18" r="2" fill={active ? fill : "transparent"} />
        </svg>
    );
    case "retail":
      return (
        <svg {...common} fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9h12l-1 9H7L6 9z" />
          <path d="M8 9a4 4 0 0 1 8 0" />
          <path d="M6 9l-2 0 1.4 9H7" />
        </svg>
      );
    case "caterers_commissary":
      return (
        <svg {...common} fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 14h18" />
          <path d="M5 14a7 7 0 0 1 14 0" />
          <path d="M12 7v-2" />
        </svg>
      );
    default: // unknown
      return (
        <svg {...common} fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9a2.5 2.5 0 1 1 4.4 1.5c-.7.7-1.9 1.1-1.9 2.5" />
          <circle cx="12" cy="17" r="1" fill={active ? fill : "transparent"} />
        </svg>
      );
  }
}

export default function FilterSearch({
  searchTerm,
  setSearchTerm,
  showRedPins,
  setShowRedPins,
  showYellowPins,
  setShowYellowPins,
  showGreenPins,
  setShowGreenPins,
  showMissing,
  setShowMissing,
  filtersOpen,
  setFiltersOpen,
  catToggles,
  setCatToggles,
  CATEGORY_SPECS,
  CAT_COLORS,
  buildInitialCatToggles,
  onAdjustClick,
  adjustContent,
}) {
  const [tab, setTab] = React.useState("adjust");
  const isDesktop = useMedia("(min-width: 900px)");

  React.useEffect(() => {
    setFiltersOpen(tab === "filter");
  }, [tab, setFiltersOpen]);

  const allOn = React.useMemo(
    () => Object.keys(CATEGORY_SPECS).every((k) => catToggles[k]?.enabled),
    [CATEGORY_SPECS, catToggles],
  );
  const allOff = React.useMemo(
    () => Object.keys(CATEGORY_SPECS).every((k) => catToggles[k] && !catToggles[k].enabled),
    [CATEGORY_SPECS, catToggles],
  );

  const handleAllOn = () => setCatToggles(buildInitialCatToggles());
  const handleAllOff = () => {
    const off = {};
    for (const [k, spec] of Object.entries(CATEGORY_SPECS)) {
      const subs = {};
      for (const p of spec.subs) subs[`${p.ft}:${p.st}`] = false;
      off[k] = { enabled: false, subs };
    }
    setCatToggles(off);
  };

  const shortLabel = (label) => {
    if (/Hospitals/i.test(label)) return "Healthcare";
    if (/Caterers/i.test(label)) return "Caterers";
    if (/Other/i.test(label)) return "Other";
    return label;
  };

  const toggleCategory = (key, spec, next) => {
    setCatToggles((prev) => {
      const subs = {};
      for (const p of spec.subs) subs[`${p.ft}:${p.st}`] = next;
      return { ...prev, [key]: { enabled: next, subs } };
    });
  };

  return (
    <div className="controls">
      <div
        className="control-card"
        style={
          isDesktop
            ? { width: "clamp(320px, 32vw, 520px)", maxWidth: "calc(100vw - 32px)" }
            : { maxWidth: "calc(100vw - 24px)" }
        }
      >
        <div className="search-bar" style={{ width: "100%", boxSizing: "border-box", overflow: "hidden" }}>
          <svg viewBox="0 0 24 24" className="icon" aria-hidden="true">
            <path
              d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 A6.5 6.5 0 1 0 9.5 16 c1.61 0 3.09-.59 4.23-1.57l.27.28v.79L20 21.5 21.5 20 15.5 14zM9.5 14A4.5 4.5 0 1 1 14 9.5 4.505 4.505 0 0 1 9.5 14z"
              fill="currentColor"
            />
          </svg>
          <input
            type="text"
            placeholder="Search by name"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>

        <div className="rgb-toggles">
          <div className="rgb-row">
            <span className="label">Show Red</span>
            <label className="switch sm red">
              <input type="checkbox" checked={showRedPins} onChange={(e) => setShowRedPins(e.target.checked)} />
              <span />
            </label>
          </div>
          <div className="rgb-row">
            <span className="label">Show Yellow</span>
            <label className="switch sm yellow">
              <input type="checkbox" checked={showYellowPins} onChange={(e) => setShowYellowPins(e.target.checked)} />
              <span />
            </label>
          </div>
          <div className="rgb-row">
            <span className="label">Show Green</span>
            <label className="switch sm green">
              <input type="checkbox" checked={showGreenPins} onChange={(e) => setShowGreenPins(e.target.checked)} />
              <span />
            </label>
          </div>
          <div className="rgb-row">
            <span className="label">Show unscored</span>
            <label className="switch sm">
              <input type="checkbox" checked={showMissing} onChange={(e) => setShowMissing(e.target.checked)} />
              <span />
            </label>
          </div>
        </div>

        <div className="filters">
          <Tabs.Root
            className="rx-tabs"
            value={tab}
            onValueChange={(v) => {
              setTab(v);
              if (v === "adjust") onAdjustClick?.();
            }}
          >
            <Tabs.List className="rx-tabs-list" aria-label="Adjust or Filter">
              <Tabs.Trigger className="rx-tab" value="adjust">Adjust</Tabs.Trigger>
              <Tabs.Trigger className="rx-tab" value="filter">Filter</Tabs.Trigger>
            </Tabs.List>

            <Tabs.Content className="rx-tab-content" value="adjust">
              {adjustContent ?? null}
            </Tabs.Content>

            <Tabs.Content className="rx-tab-content" value="filter">
              <div className="cat-filters" aria-label="Filters">
                <div className="filter-panel-header" style={{ paddingBottom: 6 }}>
                  <div className="seg-toggle" role="radiogroup" aria-label="Toggle all categories" style={{ margin: "0 auto" }}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={allOff}
                      className={`seg-option ${allOff ? "checked" : ""}`}
                      onClick={handleAllOff}
                    >
                      All off
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={allOn}
                      className={`seg-option ${allOn ? "checked" : ""}`}
                      onClick={handleAllOn}
                    >
                      All on
                    </button>
                  </div>
                </div>

                {/* icon tile grid */}
                <div className="cat-grid">
                  {Object.entries(CATEGORY_SPECS).map(([key, spec]) => {
                    const enabled = !!catToggles[key]?.enabled;
                    const label = shortLabel(spec.label);
                    const accent = "#BAA7FF";
                    return (
                      <button
                        key={key}
                        type="button"
                        className="cat-tile"
                        data-checked={enabled}
                        aria-pressed={enabled}
                        onClick={() => toggleCategory(key, spec, !enabled)}
                        title={spec.label}
                        style={{ ["--tile-accent"]: accent }}
                      >
                        <span className="cat-icon"><Icon k={key} active={enabled} /></span>
                        <span className="cat-label">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </Tabs.Content>
          </Tabs.Root>
        </div>
      </div>
    </div>
  );
}
