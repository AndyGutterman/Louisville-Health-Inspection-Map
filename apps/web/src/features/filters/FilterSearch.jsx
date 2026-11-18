// The filter card at the top left of the map. Collapsed, it shows the pin switches and the
// date picker (PinBar); open, it adds labelled switches (PinSwitches) and two tabs: Adjust
// (the score sliders, passed in as adjustContent) and Filter (counties and categories,
// FilterTab).
import "../../styles/AdjustFilter.css";
import "../../styles/ToggleRow.css";
import "../../styles/CountyLoad.css";
import React from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { useT } from "../../I18nContext.jsx";
import { useMediaQuery } from "../../hooks/useMediaQuery.js";
import PinBar from "./PinBar.jsx";
import PinSwitches from "./PinSwitches.jsx";
import FilterTab from "./FilterTab.jsx";

export default function FilterSearch({
  showRedPins,
  setShowRedPins,
  showYellowPins,
  setShowYellowPins,
  showGreenPins,
  setShowGreenPins,
  showMissing,
  setShowMissing,
  catToggles,
  setCatToggles,
  CATEGORY_SPECS,
  buildInitialCatToggles,
  adjustContent,
  dateFilterKey,
  setDateFilterKey,
  dateFilterOpts,
  regions = [], // the counties the site covers (lib/regions.js)
  counties = [], // each one's switch: { id, name, shown, state, places } (Map.jsx)
  onToggleCounty, // (id, on)
}) {
  const { t } = useT();
  const [tab, setTab] = React.useState("adjust");
  const [collapsed, setCollapsed] = React.useState(true);
  const isDesktop = useMediaQuery("(min-width: 900px)");
  const cardRef = React.useRef(null);

  // Publish the card's bottom edge as --filter-bottom so other panels
  // (What's New) can size themselves to sit beneath it instead of under it.
  React.useEffect(() => {
    const el = cardRef.current;
    if (!el) return undefined;
    const root = document.documentElement;
    const publish = () => {
      root.style.setProperty(
        "--filter-bottom",
        `${Math.ceil(el.getBoundingClientRect().bottom)}px`,
      );
    };
    publish();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(publish) : null;
    ro?.observe(el);
    window.addEventListener("resize", publish);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", publish);
      root.style.removeProperty("--filter-bottom");
    };
  }, []);

  const pins = {
    showRedPins,
    setShowRedPins,
    showYellowPins,
    setShowYellowPins,
    showGreenPins,
    setShowGreenPins,
    showMissing,
    setShowMissing,
  };

  return (
    <div className="controls">
      <div
        ref={cardRef}
        data-testid="filter-panel"
        className={`control-card ${collapsed ? "collapsed" : ""}`}
        style={
          isDesktop
            ? {} /* desktop: as wide as the top row, open or closed (Map.css) */
            : collapsed
              ? { maxWidth: "calc(100vw - 32px)" }
              : { width: "clamp(280px, calc(100vw - 32px), 420px)", maxWidth: "calc(100vw - 32px)" }
        }
      >
        <div className="search-row">
          <div className="search-bar">
            <button
              type="button"
              className="menu-btn"
              aria-label={collapsed ? t("filters.expand") : t("filters.collapse")}
              onClick={() => setCollapsed((v) => !v)}
            >
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path
                  d="M5 7h14M5 12h14M5 17h14"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          <PinBar
            {...pins}
            dateFilterKey={dateFilterKey}
            setDateFilterKey={setDateFilterKey}
            dateFilterOpts={dateFilterOpts}
          />
        </div>

        {!collapsed && (
          <div className="control-content">
            <PinSwitches isDesktop={isDesktop} {...pins} />

            <div className="filters">
              <Tabs.Root className="rx-tabs" value={tab} onValueChange={setTab}>
                <Tabs.List className="rx-tabs-list" aria-label={t("filters.tabsLabel")}>
                  <Tabs.Trigger className="rx-tab" value="adjust">
                    {t("filters.tab.adjust")}
                  </Tabs.Trigger>
                  <Tabs.Trigger className="rx-tab" value="filter">
                    {t("filters.tab.filter")}
                  </Tabs.Trigger>
                </Tabs.List>

                <Tabs.Content className="rx-tab-content" value="adjust">
                  {adjustContent ?? null}
                </Tabs.Content>

                <Tabs.Content className="rx-tab-content" value="filter">
                  <FilterTab
                    regions={regions}
                    counties={counties}
                    onToggleCounty={onToggleCounty}
                    catToggles={catToggles}
                    setCatToggles={setCatToggles}
                    CATEGORY_SPECS={CATEGORY_SPECS}
                    buildInitialCatToggles={buildInitialCatToggles}
                  />
                </Tabs.Content>
              </Tabs.Root>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
