// One watch area in the Saved panel: its radius, its sort, and the places inside it.
import { useT } from "../../I18nContext.jsx";
import { WATCH_RADIUS_OPTIONS } from "../../watchAreaLayer.js";
import { DEFAULT_SORT, SORTS, sortPlaces } from "../../lib/watchAreaSort.js";
import PlaceRow from "./PlaceRow.jsx";
import { PAGE, ZONE_ROWS } from "./limits.js";

/**
 * zones, zoneSort, zoneShown: the panel's state for every area, by area id (the places
 * read, the sort picked, how many are shown), with the setters for the last two.
 */
export default function WatchAreaCard({
  area,
  zones,
  zoneSort,
  zoneShown,
  setZoneSort,
  setZoneShown,
  activeEid,
  onOpenEstablishment,
  openRow,
  removeArea,
  updateAreaRadius,
}) {
  const { t } = useT();
  const z = zones[area.id];
  const sortKey = zoneSort[area.id] || DEFAULT_SORT;
  const rows = z?.rows ? sortPlaces(z.rows, sortKey) : [];
  const shown = zoneShown[area.id] || PAGE;
  return (
    <div key={area.id} className="wl-item" data-area-id={area.id}>
      <div className="wl-row">
        <div className="wl-grow">
          <div className="wl-name">{area.label || area.center_address}</div>
          <div className="wl-sub">{area.center_address}</div>
        </div>
        <button className="wl-remove" onClick={() => removeArea(area.id)}>
          {t("saved.remove")}
        </button>
      </div>

      <div className="wl-seg">
        {WATCH_RADIUS_OPTIONS.map((r) => (
          <button
            key={r}
            className={area.radius_miles === r ? "on" : ""}
            onClick={() => updateAreaRadius(area.id, r)}
          >
            {t("saved.miles", { n: r })}
          </button>
        ))}
      </div>

      <div className="wl-zone-hd">
        <span>{z ? t("saved.area.count", { n: z.rows.length }) : t("saved.loading")}</span>
        <div className="wl-sort" role="group" aria-label={t("saved.area.sort")}>
          {SORTS.map((s) => (
            <button
              key={s.key}
              className={sortKey === s.key ? "on" : ""}
              onClick={() => setZoneSort((prev) => ({ ...prev, [area.id]: s.key }))}
            >
              {t(s.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {z?.error && (
        <div className="wl-banner" style={{ margin: 0 }}>
          {z.error}
        </div>
      )}
      {z && !z.error && rows.length === 0 && (
        <div className="wl-empty" style={{ padding: 0 }}>
          {t("saved.area.none")}
        </div>
      )}

      {rows.length >= ZONE_ROWS && (
        <div className="wl-quiet" data-testid="zone-capped">
          {t("saved.area.capped", { n: ZONE_ROWS })}
        </div>
      )}

      {rows.slice(0, shown).map((p) => (
        <PlaceRow
          key={p.establishment_id}
          p={p}
          active={!!activeEid && activeEid === p.establishment_id}
          onOpen={onOpenEstablishment ? openRow : undefined}
        />
      ))}

      {rows.length > shown && (
        <button
          className="wl-more"
          onClick={() => setZoneShown((prev) => ({ ...prev, [area.id]: shown + PAGE }))}
        >
          {t("saved.area.more", { n: Math.min(PAGE, rows.length - shown) })}
        </button>
      )}
    </div>
  );
}
