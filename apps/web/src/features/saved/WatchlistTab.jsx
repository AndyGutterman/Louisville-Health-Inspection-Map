// The Saved panel's contents: saved places (SavedPlaces) and watch areas (WatchAreaCard,
// AddAreaForm). This file holds the state and the reads and writes (api/watchlist.js).
import { scrollBehavior } from "../../lib/motion.js";
import React, { useState, useEffect } from "react";
import {
  addWatchArea,
  fetchSavedPlaces,
  fetchWatchAreaRows,
  fetchZonePlaces,
  removeSavedPlace,
  removeWatchArea,
  updateWatchArea,
} from "../../api/watchlist.js";
import { useT } from "../../I18nContext.jsx";
import { applyAreaEdit, withoutZone } from "../../lib/watchAreaEdits.js";
import { CAPS, ZONE_ROWS } from "./limits.js";
import SavedPlaces from "./SavedPlaces.jsx";
import WatchAreaCard from "./WatchAreaCard.jsx";
import AddAreaForm from "./AddAreaForm.jsx";
import "../../styles/WatchlistTab.css";

export default function WatchlistTab({
  user,
  compact = false,
  onOpenEstablishment, // (establishment_id, row) => void; makes restaurant rows clickable
  activeEid, // establishment currently shown in the info drawer
  onItemRemoved, // (establishment_id) => void; tells the map the bookmark is gone
  refreshToken, // changes whenever the map/drawer adds or removes a bookmark
  focusAreaId, // { id, n } when the map asks to jump to one watch area
  areaEdit, // { id, update, n }: an area just moved or resized on the map (useWatchlist)
  onAreasChange, // (areas) => void; this list's areas after an add, remove or resize
}) {
  const { t } = useT();
  const [items, setItems] = useState([]);
  const [areas, setAreas] = useState([]);
  const [zones, setZones] = useState({});
  const [zoneSort, setZoneSort] = useState({});
  const [zoneShown, setZoneShown] = useState({});
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState("");
  const [pick, setPick] = useState(null);
  const [pickerKey, setPickerKey] = useState(0);
  const [areaLabel, setAreaLabel] = useState("");
  const [areaRadius, setAreaRadius] = useState(2);
  const [saving, setSaving] = useState(false);

  // Opened from a watch-area popup on the map: scroll to that area and flash it.
  useEffect(() => {
    if (!focusAreaId || loading) return undefined;
    const el = document.querySelector(`[data-area-id="${focusAreaId.id}"]`);
    if (!el) return undefined;
    el.scrollIntoView({ block: "start", behavior: scrollBehavior() });
    el.classList.add("wl-flash");
    const t = setTimeout(() => el.classList.remove("wl-flash"), 1600);
    return () => clearTimeout(t);
  }, [focusAreaId, loading, areas]);

  useEffect(() => {
    if (!user) return;
    Promise.all([fetchSavedPlaces(user.id), fetchWatchAreaRows(user.id)]).then(([wRes, aRes]) => {
      const e = wRes.error || aRes.error;
      if (e) {
        console.error("Watchlist load failed:", e);
        setBanner(t("saved.loadError", { message: e.message }));
      }
      setItems(wRes.data || []);
      setAreas(aRes.data || []);
      setLoading(false);
    });
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps -- t: a language change must not re-read

  // The map and info drawer can now change bookmarks while this list is on screen.
  const firstRefresh = React.useRef(true);
  useEffect(() => {
    if (firstRefresh.current) {
      firstRefresh.current = false;
      return;
    }
    if (!user) return;
    fetchSavedPlaces(user.id).then(({ data }) => {
      if (data) setItems(data);
    });
  }, [refreshToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // ...and the map's circle editor can move or resize a watch area while this list is on
  // screen. Its change is applied here, and only that area's places are read again.
  useEffect(() => {
    if (!areaEdit) return;
    setAreas((prev) => applyAreaEdit(prev, areaEdit));
    setZones((prev) => withoutZone(prev, areaEdit.id));
  }, [areaEdit]);

  // This list changed: the map's circles follow (useWatchlist setWatchAreas).
  const changeAreas = (next) => {
    setAreas(next);
    onAreasChange?.(next);
  };

  useEffect(() => {
    let cancelled = false;
    areas.forEach((a) => {
      if (zones[a.id]) return;
      fetchZonePlaces(a.id, ZONE_ROWS).then(({ data, error }) => {
        if (cancelled) return;
        setZones((prev) => ({
          ...prev,
          [a.id]: error ? { rows: [], error: error.message } : { rows: data || [] },
        }));
      });
    });
    return () => {
      cancelled = true;
    };
  }, [areas]); // eslint-disable-line react-hooks/exhaustive-deps

  async function removeItem(id) {
    const gone = items.find((i) => i.id === id);
    await removeSavedPlace(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (gone) onItemRemoved?.(gone.establishment_id);
  }

  const openRow = (row) => onOpenEstablishment?.(row.establishment_id, row);

  async function addArea() {
    if (!pick || saving || areas.length >= CAPS.areas) return;
    setBanner("");
    setSaving(true);
    const { data, error } = await addWatchArea({
      user_id: user.id,
      label: areaLabel.trim() || null,
      center_address: pick.address,
      center_lat: pick.lat,
      center_lon: pick.lon,
      radius_miles: areaRadius,
    });
    setSaving(false);
    if (error) {
      setBanner(t("saved.addError", { message: error.message }));
      return;
    }
    changeAreas([data, ...areas]);
    setPick(null);
    setAreaLabel("");
    setPickerKey((k) => k + 1);
  }

  async function removeArea(id) {
    await removeWatchArea(id);
    changeAreas(areas.filter((a) => a.id !== id));
  }

  async function updateAreaRadius(id, r) {
    const { error } = await updateWatchArea(id, { radius_miles: r });
    if (error) {
      setBanner(t("saved.radiusError", { message: error.message }));
      return;
    }
    setZones((prev) => withoutZone(prev, id));
    changeAreas(applyAreaEdit(areas, { id, update: { radius_miles: r } }));
  }

  if (loading) {
    return (
      <>
        <div className="wl-empty">{t("saved.loading")}</div>
      </>
    );
  }

  const atAreaCap = areas.length >= CAPS.areas;

  return (
    <div className={compact ? "wl-compact" : undefined}>
      {banner && (
        <div className="wl-banner" role="alert">
          {banner}
        </div>
      )}

      <SavedPlaces
        items={items}
        activeEid={activeEid}
        onOpenEstablishment={onOpenEstablishment}
        openRow={openRow}
        removeItem={removeItem}
      />

      <div className="wl-section">
        <div className="wl-section-hd">
          <h3>{t("saved.areas.title")}</h3>
          <span className="wl-usage">
            {areas.length} / {CAPS.areas}
          </span>
        </div>

        {areas.length === 0 && (
          <div className="wl-empty" style={{ marginBottom: 12 }}>
            {t("saved.areas.empty")}
          </div>
        )}

        <div className="wl-list" style={{ marginBottom: areas.length ? 18 : 0 }}>
          {areas.map((area) => (
            <WatchAreaCard
              key={area.id}
              area={area}
              zones={zones}
              zoneSort={zoneSort}
              zoneShown={zoneShown}
              setZoneSort={setZoneSort}
              setZoneShown={setZoneShown}
              activeEid={activeEid}
              onOpenEstablishment={onOpenEstablishment}
              openRow={openRow}
              removeArea={removeArea}
              updateAreaRadius={updateAreaRadius}
            />
          ))}
        </div>

        {atAreaCap ? (
          <div className="wl-quiet">{t("saved.areas.full", { n: CAPS.areas })}</div>
        ) : (
          <AddAreaForm
            pickerKey={pickerKey}
            pick={pick}
            setPick={setPick}
            areaLabel={areaLabel}
            setAreaLabel={setAreaLabel}
            areaRadius={areaRadius}
            setAreaRadius={setAreaRadius}
            addArea={addArea}
            saving={saving}
          />
        )}
      </div>
    </div>
  );
}
