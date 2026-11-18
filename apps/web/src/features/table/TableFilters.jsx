// Table View's chip rows: County, inspection Type and Facility category.
import { useT } from "../../I18nContext.jsx";
import { FACILITY_CATS } from "../../lib/tableQuery.js";
import { joinNames, regionName } from "./tableRegions.js";

/**
 * regions: the counties listed; unlisted: switched on but not in the table views yet.
 * county, selTypes, selCats: what is picked (null = all), with the functions that change them.
 * facilityOn: whether the Facility chips can filter what's listed.
 */
export default function TableFilters({
  regions: REGIONS,
  unlisted,
  county,
  pickCounty,
  types,
  selTypes,
  setSelTypes,
  toggleType,
  facilityOn,
  selCats,
  setSelCats,
  toggleCat,
}) {
  const { t, locale } = useT();
  return (
    <div className="table-filters" data-testid="table-filters">
      {/* County chips */}
      <div className="table-filter-row">
        <span className="table-filter-label">{t("table.county")}</span>
        <div className="table-type-chips">
          {REGIONS.length !== 1 && (
            <button
              className={`table-chip ${county === null ? "active" : ""}`}
              onClick={() => pickCounty(null)}
            >
              {REGIONS.length === 2 ? t("table.both") : t("table.all")}
            </button>
          )}
          {REGIONS.map((r) => (
            <button
              key={r.id}
              data-testid={`table-county-${r.id}`}
              className={`table-chip ${county === r.id || REGIONS.length === 1 ? "active" : ""}`}
              onClick={() => pickCounty(county === r.id ? null : r.id)}
              title={r.name}
            >
              {r.shortName}
            </button>
          ))}
          {unlisted.length > 0 && (
            <span className="table-filter-note" data-testid="table-county-note">
              {t(unlisted.length > 1 ? "table.notInTable.many" : "table.notInTable.one", {
                names: joinNames(
                  unlisted.map((r) => r.shortName),
                  t,
                ),
              })}
            </span>
          )}
        </div>
      </div>

      {/* Inspection type chips */}
      {types.length > 0 && (
        <div className="table-filter-row">
          <span className="table-filter-label">{t("table.type")}</span>
          <div className="table-type-chips">
            <button
              className={`table-chip ${selTypes === null ? "active" : ""}`}
              onClick={() => setSelTypes(null)}
            >
              {t("table.all")}
            </button>
            {types.map((ty) => (
              <button
                key={ty.type}
                className={`table-chip ${selTypes?.has(ty.type) ? "active" : ""}`}
                onClick={() => toggleType(ty.type)}
                title={t("table.typeCount", { n: ty.count.toLocaleString(locale) })}
              >
                {ty.type}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Facility category chips: Jefferson only (its data is the one with types) */}
      <div className="table-filter-row">
        <span className="table-filter-label">{t("table.facility")}</span>
        {facilityOn ? (
          <div className="table-type-chips">
            <button
              className={`table-chip ${selCats === null ? "active" : ""}`}
              onClick={() => setSelCats(null)}
            >
              {t("table.all")}
            </button>
            {Object.keys(FACILITY_CATS).map((key) => (
              <button
                key={key}
                className={`table-chip ${selCats?.has(key) ? "active" : ""}`}
                onClick={() => toggleCat(key)}
                title={t("table.facilityTitle")}
              >
                {t(`table.cat.${key}`)}
              </button>
            ))}
          </div>
        ) : (
          <span className="table-filter-note" data-testid="table-facility-note">
            {county
              ? t("table.noFacilityNamed", { name: regionName(county) })
              : t("table.noFacilityThis")}
          </span>
        )}
      </div>
    </div>
  );
}
