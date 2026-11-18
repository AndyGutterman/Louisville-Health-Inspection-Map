// The Filter tab: the counties on the map, and the category tiles for the counties whose
// data has facility types (Jefferson).
import React from "react";
import { nameList } from "../../lib/regions.js";
import { useT } from "../../I18nContext.jsx";
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
  const { t, lang, locale } = useT();
  // A word from the dictionary, or the English one the data gave when there is none.
  const word = (key, fallback) => {
    const w = t(key);
    return w === key ? fallback : w;
  };
  const list = (names) =>
    lang === "en"
      ? nameList(names)
      : new Intl.ListFormat(locale, { type: "conjunction" }).format(names);
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
        <legend className="county-switches-title">{t("filters.counties")}</legend>
        <div className="county-group" data-testid="county-group-typed">
          {typedCounties.map((c) => (
            <CountySwitch key={c.id} county={c} onToggle={onToggleCounty} />
          ))}
          <div
            className="cat-filters"
            aria-label={t("filters.categories")}
            data-testid="category-filters"
            data-inactive={!categoriesApply}
          >
            <div className="filter-panel-header" style={{ paddingBottom: 6 }}>
              <div
                className="seg-toggle"
                role="radiogroup"
                aria-label={t("filters.toggleAll")}
                style={{ margin: "0 auto" }}
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={allOff}
                  className={`seg-option ${allOff ? "checked" : ""}`}
                  onClick={handleAllOff}
                >
                  {t("filters.allOff")}
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={allOn}
                  className={`seg-option ${allOn ? "checked" : ""}`}
                  onClick={handleAllOn}
                >
                  {t("filters.allOn")}
                </button>
              </div>
            </div>

            <div className="cat-grid">
              {Object.entries(CATEGORY_SPECS).map(([key, spec]) => {
                const enabled = !!catToggles[key]?.enabled;
                const label = word(`filters.cat.${key}`, shortLabel(spec.label));
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
                    title={word(`filters.catFull.${key}`, spec.label)}
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
              {t("filters.countyNote")}
              {undatedNames.length > 0 &&
                ` ${t("filters.undatedNote", { names: list(undatedNames) })}`}
            </p>
          </div>
        )}
      </fieldset>
    </>
  );
}
