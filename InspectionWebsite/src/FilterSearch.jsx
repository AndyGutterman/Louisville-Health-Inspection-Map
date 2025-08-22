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

  const allOn = React.useMemo(() => {
    return Object.keys(CATEGORY_SPECS).every((k) => catToggles[k]?.enabled);
  }, [CATEGORY_SPECS, catToggles]);

  const allOff = React.useMemo(() => {
    return Object.keys(CATEGORY_SPECS).every(
      (k) => catToggles[k] && !catToggles[k].enabled,
    );
  }, [CATEGORY_SPECS, catToggles]);

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

  return (
    <div className="controls">
      <div
        className="control-card"
        style={
          isDesktop
            ? {
                width: "clamp(320px, 32vw, 520px)",
                maxWidth: "calc(100vw - 32px)",
              }
            : { maxWidth: "calc(100vw - 24px)" }
        }
      >
        <div
          className="search-bar"
          style={{
            width: "100%",
            boxSizing: "border-box",
            overflow: "hidden",
          }}
        >
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
              <input
                type="checkbox"
                checked={showRedPins}
                onChange={(e) => setShowRedPins(e.target.checked)}
              />
              <span />
            </label>
          </div>
          <div className="rgb-row">
            <span className="label">Show Yellow</span>
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
            <span className="label">Show Green</span>
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
            <span className="label">Show unscored</span>
            <label className="switch sm">
              <input
                type="checkbox"
                checked={showMissing}
                onChange={(e) => setShowMissing(e.target.checked)}
              />
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
              <Tabs.Trigger className="rx-tab" value="adjust">
                Adjust
              </Tabs.Trigger>
              <Tabs.Trigger className="rx-tab" value="filter">
                Filter
              </Tabs.Trigger>
            </Tabs.List>

            <Tabs.Content className="rx-tab-content" value="adjust">
              {adjustContent ?? null}
            </Tabs.Content>

            <Tabs.Content className="rx-tab-content" value="filter">
              <div className="cat-filters" aria-label="Filters">
                <div className="filter-panel-header">
                  <div
                    className="seg-toggle"
                    role="radiogroup"
                    aria-label="Toggle all categories"
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={allOn}
                      className={`seg-option ${allOn ? "checked" : ""}`}
                      onClick={handleAllOn}
                    >
                      All on
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={allOff}
                      className={`seg-option ${allOff ? "checked" : ""}`}
                      onClick={handleAllOff}
                    >
                      All off
                    </button>
                  </div>
                </div>

                {Object.entries(CATEGORY_SPECS).map(([key, spec]) => (
                  <div className="rgb-row" key={key}>
                    <span className="label">{spec.label}</span>
                    <label className="switch sm">
                      <input
                        type="checkbox"
                        checked={!!catToggles[key]?.enabled}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setCatToggles((prev) => {
                            const next = { ...prev };
                            const subs = {};
                            for (const p of spec.subs)
                              subs[`${p.ft}:${p.st}`] = checked;
                            next[key] = { enabled: checked, subs };
                            return next;
                          });
                        }}
                      />
                      <span
                        style={
                          catToggles[key]?.enabled
                            ? { background: CAT_COLORS[key] }
                            : undefined
                        }
                      />
                    </label>
                  </div>
                ))}
              </div>
            </Tabs.Content>
          </Tabs.Root>
        </div>
      </div>
    </div>
  );
}
