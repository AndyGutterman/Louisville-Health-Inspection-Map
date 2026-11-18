// The Filter tab: the counties on the map, and the category tiles for the counties whose
// data has facility types (Jefferson).
import React from "react";
import { nameList } from "../../lib/regions.js";
import { allCategoriesOff, shortCategoryLabel } from "../../lib/categoryTiles.js";
import Icon from "./CategoryIcon.jsx";
import CountySwitch from "./CountySwitch.jsx";

// One accent for every category tile, so the panel reads as a single set.
const CAT_ACCENT = "#ff9f1c";
const shortLabel = shortCategoryLabel;

export default function FilterTab({
  regions = [], // the counties the site covers (lib/regions.js)
  counties = [], // each one's switch: { id, name, shown, state, places } (Map.jsx)
  onToggleCounty, // (id, on)
  catToggles,
  setCatToggles,
  CATEGORY_SPECS,
  buildInitialCatToggles,
}) {
  // Categories only mean something for counties whose data has facility types
  // (Jefferson). The others list below the category tiles, apart from them, and their
  // places always show (lib/mapFilters.js categoryFilter).
  const typedIds = new Set(regions.filter((r) => r.has.categories).map((r) => r.id));
  const typedCounties = counties.filter((c) => typedIds.has(c.id));
  const untypedCounties = counties.filter((c) => !typedIds.has(c.id));
  const categoriesApply = typedCounties.some((c) => c.shown);
  const undatedNames = regions
    .filter((r) => !r.has.dates && untypedCounties.some((c) => c.id === r.id))
    .map((r) => r.name);

  const allOn = React.useMemo(
    () => Object.keys(CATEGORY_SPECS).every((k) => catToggles[k]?.enabled),
    [CATEGORY_SPECS, catToggles],
  );
  const allOff = React.useMemo(
    () => Object.keys(CATEGORY_SPECS).every((k) => catToggles[k] && !catToggles[k].enabled),
    [CATEGORY_SPECS, catToggles],
  );

  const handleAllOn = () => setCatToggles(buildInitialCatToggles());
  const handleAllOff = () => setCatToggles(allCategoriesOff(CATEGORY_SPECS));

  const toggleCategory = (key, spec, next) => {
    setCatToggles((prev) => {
      const subs = {};
      for (const p of spec.subs) subs[`${p.ft}:${p.st}`] = next;
      return { ...prev, [key]: { enabled: next, subs } };
    });
  };

  return (
    <>
      {/* Which counties are on the map. Switching one on loads it once; after that, on
          and off only show and hide it. The category tiles sit with the counties they
          apply to. */}
      <fieldset className="county-switches" data-testid="county-switches">
        <legend className="county-switches-title">Counties</legend>
        <div className="county-group" data-testid="county-group-typed">
          {typedCounties.map((c) => (
            <CountySwitch key={c.id} county={c} onToggle={onToggleCounty} />
          ))}
          <div
            className="cat-filters"
            aria-label="Categories"
            data-testid="category-filters"
            data-inactive={!categoriesApply}
          >
            <div className="filter-panel-header" style={{ paddingBottom: 6 }}>
              <div
                className="seg-toggle"
                role="radiogroup"
                aria-label="Toggle all categories"
                style={{ margin: "0 auto" }}
              >
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

            <div className="cat-grid">
              {Object.entries(CATEGORY_SPECS).map(([key, spec]) => {
                const enabled = !!catToggles[key]?.enabled;
                const label = shortLabel(spec.label);
                const accent = CAT_ACCENT;
                return (
                  <button
                    key={key}
                    type="button"
                    data-testid="category-tile"
                    data-category={key}
                    className="cat-tile"
                    data-checked={enabled}
                    aria-pressed={enabled}
                    onClick={() => toggleCategory(key, spec, !enabled)}
                    title={spec.label}
                    style={{ "--tile-accent": accent }}
                  >
                    <span className="cat-icon">
                      <Icon k={key} active={enabled} />
                    </span>
                    <span className="cat-label">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        {untypedCounties.length > 0 && (
          <div className="county-group" data-testid="county-group-untyped">
            {untypedCounties.map((c) => (
              <CountySwitch key={c.id} county={c} onToggle={onToggleCounty} />
            ))}
            <p className="county-group-note" data-testid="county-note">
              No place types in this data, so categories don&apos;t apply: every place shows.
              {undatedNames.length > 0 &&
                ` Undated ${nameList(undatedNames)} places ignore the date filter.`}
            </p>
          </div>
        )}
      </fieldset>
    </>
  );
}
