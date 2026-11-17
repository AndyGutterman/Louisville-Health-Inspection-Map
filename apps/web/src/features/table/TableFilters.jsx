// Table View's chip rows: County, inspection Type and Facility category.
import { nameList } from "../../lib/regions.js";
import { FACILITY_CATS } from "../../lib/tableQuery.js";
import { regionName } from "./tableRegions.js";

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
  return (
    <div className="table-filters" data-testid="table-filters">
      {/* County chips */}
      <div className="table-filter-row">
        <span className="table-filter-label">County</span>
        <div className="table-type-chips">
          {REGIONS.length !== 1 && (
            <button
              className={`table-chip ${county === null ? "active" : ""}`}
              onClick={() => pickCounty(null)}
            >
              {REGIONS.length === 2 ? "Both" : "All"}
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
              {nameList(unlisted.map((r) => r.shortName))}{" "}
              {unlisted.length > 1 ? "aren't" : "isn't"} in Table View yet
            </span>
          )}
        </div>
      </div>

      {/* Inspection type chips */}
      {types.length > 0 && (
        <div className="table-filter-row">
          <span className="table-filter-label">Type</span>
          <div className="table-type-chips">
            <button
              className={`table-chip ${selTypes === null ? "active" : ""}`}
              onClick={() => setSelTypes(null)}
            >
              All
            </button>
            {types.map((t) => (
              <button
                key={t.type}
                className={`table-chip ${selTypes?.has(t.type) ? "active" : ""}`}
                onClick={() => toggleType(t.type)}
                title={`${t.count.toLocaleString()} inspections`}
              >
                {t.type}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Facility category chips: Jefferson only (its data is the one with types) */}
      <div className="table-filter-row">
        <span className="table-filter-label">Facility</span>
        {facilityOn ? (
          <div className="table-type-chips">
            <button
              className={`table-chip ${selCats === null ? "active" : ""}`}
              onClick={() => setSelCats(null)}
            >
              All
            </button>
            {Object.entries(FACILITY_CATS).map(([key, spec]) => (
              <button
                key={key}
                className={`table-chip ${selCats?.has(key) ? "active" : ""}`}
                onClick={() => toggleCat(key)}
                title="Jefferson County only: Bullitt's data has no facility types"
              >
                {spec.label}
              </button>
            ))}
          </div>
        ) : (
          <span className="table-filter-note" data-testid="table-facility-note">
            {county ? `${regionName(county)}'s` : "This county's"} data has no facility types
          </span>
        )}
      </div>
    </div>
  );
}
