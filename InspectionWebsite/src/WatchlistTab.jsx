import React, { useState, useEffect } from "react";
import AddressPicker from "./AddressPicker.jsx";
import { WATCH_RADIUS_OPTIONS } from "./watchAreaLayer.js";

const CAPS = { places: 30, areas: 3 };
const PAGE = 25;
const SORTS = [
  { key: "distance", label: "Distance" },
  { key: "score", label: "Score" },
  { key: "priority", label: "Priority" },
  { key: "critical", label: "Critical" },
];

const STYLES = `
.wl-section { margin-bottom: 30px; }
.wl-section-hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.wl-section-hd h3 { margin: 0; font-size: 0.82rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: rgba(255,255,255,0.55); }
.wl-usage { font-size: 0.74rem; color: rgba(255,255,255,0.34); font-weight: 700; }
.wl-empty { padding: 8px 0; font-size: 0.84rem; color: rgba(255,255,255,0.50); line-height: 1.5; }
.wl-banner { font-size: 0.78rem; color: #ff9a9a; background: rgba(234,67,53,0.10); border: 1px solid rgba(234,67,53,0.22);
  border-radius: 8px; padding: 8px 12px; margin-bottom: 12px; }
.wl-list { display: flex; flex-direction: column; gap: 10px; }
.wl-item { padding: 14px; border-radius: 10px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.10);
  display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.wl-row { display: flex; gap: 10px; align-items: flex-start; }
.wl-grow { flex: 1; min-width: 0; }
.wl-name { font-weight: 700; font-size: 0.9rem; color: #f0f0f3; margin-bottom: 2px; overflow-wrap: anywhere; }
.wl-sub { font-size: 0.74rem; color: rgba(255,255,255,0.45); overflow-wrap: anywhere; }
.wl-score { font-size: 0.8rem; font-weight: 700; color: rgba(255,255,255,0.70); margin-top: 6px; }
.wl-score.good { color: #34a853; }
.wl-score.fair { color: #fbbc05; }
.wl-score.poor { color: #ea4335; }
.wl-score .dt { color: rgba(255,255,255,0.40); font-weight: 600; }
.wl-remove { padding: 6px 12px; border-radius: 6px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
  color: rgba(255,255,255,0.62); font-size: 0.72rem; cursor: pointer; white-space: nowrap; font-family: inherit; flex-shrink: 0; }
.wl-remove:hover { background: rgba(234,67,53,0.16); border-color: rgba(234,67,53,0.30); color: #ff9a9a; }

.wl-seg { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 4px; }
.wl-seg button { padding: 7px 4px; border-radius: 6px; background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.11); color: rgba(255,255,255,0.60); font-size: 0.72rem; font-weight: 700;
  cursor: pointer; font-family: inherit; white-space: nowrap; }
.wl-seg button:hover { border-color: rgba(255,159,28,0.35); }
.wl-seg button.on { background: rgba(255,159,28,0.14); border-color: rgba(255,159,28,0.50); color: #ffb347; }

.wl-zone-hd { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;
  font-size: 0.72rem; color: rgba(255,255,255,0.45); font-weight: 700; }
.wl-sort { display: flex; gap: 4px; flex-wrap: wrap; }
.wl-sort button { padding: 4px 9px; border-radius: 999px; background: transparent; border: 1px solid rgba(255,255,255,0.12);
  color: rgba(255,255,255,0.55); font-size: 0.68rem; font-weight: 700; cursor: pointer; font-family: inherit; }
.wl-sort button.on { background: rgba(52,168,83,0.14); border-color: rgba(52,168,83,0.45); color: #6fcf8a; }

.wl-place { display: flex; gap: 10px; align-items: center; padding: 9px 10px; border-radius: 8px;
  background: rgba(0,0,0,0.18); border-left: 3px solid rgba(255,255,255,0.08); min-width: 0; }
.wl-place.fail { border-left-color: #ea4335; }
.wl-place-main { flex: 1; min-width: 0; }
.wl-place-name { font-size: 0.82rem; font-weight: 700; color: #f0f0f3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wl-place-addr { font-size: 0.68rem; color: rgba(255,255,255,0.42); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wl-place-side { text-align: right; flex-shrink: 0; }
.wl-place-score { font-size: 0.8rem; font-weight: 800; color: rgba(255,255,255,0.7); }
.wl-place-score.good { color: #34a853; }
.wl-place-score.fair { color: #fbbc05; }
.wl-place-score.poor { color: #ea4335; }
.wl-place-date { font-size: 0.64rem; color: rgba(255,255,255,0.40); margin-top: 1px; }
.wl-crit { font-size: 0.64rem; color: #ff9a9a; margin-top: 2px; }
.wl-more { align-self: center; padding: 7px 16px; border-radius: 999px; background: transparent;
  border: 1px solid rgba(255,255,255,0.14); color: rgba(255,255,255,0.6); font-size: 0.72rem; font-weight: 700;
  cursor: pointer; font-family: inherit; }

.wl-add { padding: 16px; border-radius: 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.09);
  display: flex; flex-direction: column; gap: 12px; }
.wl-add-title { font-size: 0.82rem; font-weight: 700; color: #f0f0f3; }
.wl-input { display: block; width: 100%; box-sizing: border-box; height: 40px; padding: 0 12px; border-radius: 8px;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.13); color: #f0f0f3; font-size: 0.88rem; font-family: inherit; }
.wl-input:focus { outline: none; border-color: rgba(52,168,83,0.50); }
.wl-add-opts { display: grid; grid-template-columns: 1fr; gap: 12px; }
@media (min-width: 560px) { .wl-add-opts { grid-template-columns: 160px 1fr; align-items: end; } }
.wl-lbl { font-size: 0.64rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: rgba(255,255,255,0.40); margin-bottom: 6px; }
.wl-add-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.wl-hint { font-size: 0.72rem; color: rgba(255,255,255,0.40); }
.wl-btn { padding: 10px 20px; border-radius: 8px; background: rgba(52,168,83,0.16); border: 1px solid rgba(52,168,83,0.34);
  color: #6fcf8a; font-weight: 700; font-size: 0.84rem; cursor: pointer; font-family: inherit; }
.wl-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.wl-quiet { font-size: 0.78rem; color: rgba(255,255,255,0.42); padding: 4px 2px 0; }

@media (max-width: 560px) {
  .wl-input { font-size: 16px; height: 44px; }
  .wl-item { padding: 12px; }
  .wl-seg button { padding: 10px 4px; }
  .wl-sort button { padding: 6px 10px; }
  .wl-remove { padding: 7px 12px; }
  .wl-btn { width: 100%; padding: 12px 20px; }
  .wl-add-foot .wl-btn { order: -1; }
}
`;

const scoreClass = (s) => (s == null || s === 0 ? "" : s >= 85 ? "good" : s >= 70 ? "fair" : "poor");
const fmtDate = (d) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;

// Distance: nearest first. Score: highest first. Priority: failing first, then most critical, then lowest score.
// Critical: most critical violations first, ties broken by highest score.
function sortPlaces(rows, key) {
  const hi = (r) => (r.score == null || r.score === 0 ? -1 : r.score);
  const lo = (r) => (r.score == null || r.score === 0 ? 999 : r.score);
  const copy = [...rows];
  if (key === "distance") copy.sort((a, b) => (a.distance_mi ?? 1e9) - (b.distance_mi ?? 1e9));
  if (key === "score") copy.sort((a, b) => hi(b) - hi(a));
  if (key === "priority")
    copy.sort((a, b) => Number(b.failing) - Number(a.failing) || b.critical_6mo - a.critical_6mo || lo(a) - lo(b));
  if (key === "critical") copy.sort((a, b) => b.critical_6mo - a.critical_6mo || hi(b) - hi(a));
  return copy;
}

function PlaceRow({ p }) {
  return (
    <div className={`wl-place${p.failing ? " fail" : ""}`}>
      <div className="wl-place-main">
        <div className="wl-place-name">{p.name}</div>
        <div className="wl-place-addr">
          {p.address}
          {p.distance_mi != null && ` · ${p.distance_mi} mi`}
        </div>
      </div>
      <div className="wl-place-side">
        <div className={`wl-place-score ${scoreClass(p.score)}`}>
          {p.score ? p.score : "N/A"}
          {p.grade ? ` · ${p.grade}` : ""}
        </div>
        {p.inspection_date && <div className="wl-place-date">{fmtDate(p.inspection_date)}</div>}
        {p.critical_6mo > 0 && <div className="wl-crit">{p.critical_6mo} critical · 6 mo</div>}
      </div>
    </div>
  );
}

export default function WatchlistTab({ supabase, user }) {
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
  const [areaRadius, setAreaRadius] = useState(5);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!supabase || !user) return;
    Promise.all([
      supabase.from("v_watchlist_with_latest").select("*").eq("user_id", user.id),
      supabase.from("watchlist_areas").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    ]).then(([wRes, aRes]) => {
      const e = wRes.error || aRes.error;
      if (e) {
        console.error("Watchlist load failed:", e);
        setBanner(`Couldn't load your watchlist: ${e.message}`);
      }
      setItems(wRes.data || []);
      setAreas(aRes.data || []);
      setLoading(false);
    });
  }, [supabase, user]);

  useEffect(() => {
    let cancelled = false;
    areas.forEach((a) => {
      if (zones[a.id]) return;
      supabase.rpc("watch_zone_places", { p_area_id: a.id }).then(({ data, error }) => {
        if (cancelled) return;
        setZones((prev) => ({
          ...prev,
          [a.id]: error ? { rows: [], error: error.message } : { rows: data || [] },
        }));
      });
    });
    return () => { cancelled = true; };
  }, [areas]); // eslint-disable-line react-hooks/exhaustive-deps

  async function removeItem(id) {
    await supabase.from("watchlist").delete().eq("id", id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  async function addArea() {
    if (!pick || saving || areas.length >= CAPS.areas) return;
    setBanner("");
    setSaving(true);
    const { data, error } = await supabase
      .from("watchlist_areas")
      .insert([{
        user_id: user.id,
        label: areaLabel.trim() || null,
        center_address: pick.address,
        center_lat: pick.lat,
        center_lon: pick.lon,
        radius_miles: areaRadius,
      }])
      .select()
      .single();
    setSaving(false);
    if (error) {
      setBanner(`Couldn't save that area: ${error.message}`);
      return;
    }
    setAreas((prev) => [data, ...prev]);
    window.dispatchEvent(new Event("watch-areas-changed"));
    setPick(null);
    setAreaLabel("");
    setPickerKey((k) => k + 1);
  }

  async function removeArea(id) {
    await supabase.from("watchlist_areas").delete().eq("id", id);
    setAreas((prev) => prev.filter((a) => a.id !== id));
    window.dispatchEvent(new Event("watch-areas-changed"));
  }

  async function updateAreaRadius(id, r) {
    const { error } = await supabase.from("watchlist_areas").update({ radius_miles: r }).eq("id", id);
    if (error) {
      setBanner(`Couldn't change that radius: ${error.message}`);
      return;
    }
    setZones((prev) => { const n = { ...prev }; delete n[id]; return n; });
    setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, radius_miles: r } : a)));
    window.dispatchEvent(new Event("watch-areas-changed"));
  }

  if (loading) {
    return (
      <>
        <style>{STYLES}</style>
        <div className="wl-empty">Loading…</div>
      </>
    );
  }

  const atAreaCap = areas.length >= CAPS.areas;

  return (
    <>
      <style>{STYLES}</style>

      {banner && <div className="wl-banner" role="alert">{banner}</div>}

      <div className="wl-section">
        <div className="wl-section-hd">
          <h3>Saved restaurants</h3>
          <span className="wl-usage">{items.length} / {CAPS.places}</span>
        </div>
        {items.length === 0 ? (
          <div className="wl-empty">Click any map pin, then save it here.</div>
        ) : (
          <div className="wl-list">
            {items.map((item) => (
              <div key={item.id} className="wl-item">
                <div className="wl-row">
                  <div className="wl-grow">
                    <div className="wl-name">{item.name}</div>
                    <div className="wl-sub">{[item.address, item.city].filter(Boolean).join(", ")}</div>
                    <div className={`wl-score ${scoreClass(item.score)}`}>
                      {item.score ? `Score ${item.score}` : "Score N/A"}
                      {item.grade ? ` · Grade ${item.grade}` : ""}
                      {item.inspection_date && <span className="dt"> · {fmtDate(item.inspection_date)}</span>}
                      {item.critical_6mo > 0 && (
                        <div className="wl-crit" style={{ marginTop: 3 }}>⚠ {item.critical_6mo} critical · 6 mo</div>
                      )}
                    </div>
                  </div>
                  <button className="wl-remove" onClick={() => removeItem(item.id)}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="wl-section">
        <div className="wl-section-hd">
          <h3>Watch areas</h3>
          <span className="wl-usage">{areas.length} / {CAPS.areas}</span>
        </div>

        {areas.length === 0 && (
          <div className="wl-empty" style={{ marginBottom: 12 }}>
            Add an address to see every restaurant within a radius, ranked however you like.
          </div>
        )}

        <div className="wl-list" style={{ marginBottom: areas.length ? 18 : 0 }}>
          {areas.map((area) => {
            const z = zones[area.id];
            const sortKey = zoneSort[area.id] || "distance";
            const rows = z?.rows ? sortPlaces(z.rows, sortKey) : [];
            const shown = zoneShown[area.id] || PAGE;
            return (
              <div key={area.id} className="wl-item">
                <div className="wl-row">
                  <div className="wl-grow">
                    <div className="wl-name">{area.label || area.center_address}</div>
                    <div className="wl-sub">{area.center_address}</div>
                  </div>
                  <button className="wl-remove" onClick={() => removeArea(area.id)}>Remove</button>
                </div>

                <div className="wl-seg">
                  {WATCH_RADIUS_OPTIONS.map((r) => (
                    <button
                      key={r}
                      className={area.radius_miles === r ? "on" : ""}
                      onClick={() => updateAreaRadius(area.id, r)}
                    >
                      {r} mi
                    </button>
                  ))}
                </div>

                <div className="wl-zone-hd">
                  <span>{z ? `${z.rows.length} restaurant${z.rows.length === 1 ? "" : "s"} in zone` : "Loading…"}</span>
                  <div className="wl-sort" role="group" aria-label="Sort restaurants">
                    {SORTS.map((s) => (
                      <button
                        key={s.key}
                        className={sortKey === s.key ? "on" : ""}
                        onClick={() => setZoneSort((prev) => ({ ...prev, [area.id]: s.key }))}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {z?.error && <div className="wl-banner" style={{ margin: 0 }}>{z.error}</div>}
                {z && !z.error && rows.length === 0 && (
                  <div className="wl-empty" style={{ padding: 0 }}>No restaurants inside this radius.</div>
                )}

                {rows.slice(0, shown).map((p) => <PlaceRow key={p.establishment_id} p={p} />)}

                {rows.length > shown && (
                  <button
                    className="wl-more"
                    onClick={() => setZoneShown((prev) => ({ ...prev, [area.id]: shown + PAGE }))}
                  >
                    Show {Math.min(PAGE, rows.length - shown)} more
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {atAreaCap ? (
          <div className="wl-quiet">
            You're using all {CAPS.areas} watch areas. Remove one to add another.
          </div>
        ) : (
          <div className="wl-add">
            <div className="wl-add-title">Add a watch area</div>
            <AddressPicker key={pickerKey} value={pick} onChange={setPick} inputClass="wl-input" />
            <div className="wl-add-opts">
              <input
                className="wl-input"
                placeholder="Label (optional)"
                maxLength={40}
                value={areaLabel}
                onChange={(e) => setAreaLabel(e.target.value)}
              />
              <div>
                <div className="wl-lbl">Radius</div>
                <div className="wl-seg">
                  {WATCH_RADIUS_OPTIONS.map((r) => (
                    <button key={r} className={areaRadius === r ? "on" : ""} onClick={() => setAreaRadius(r)}>
                      {r} mi
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="wl-add-foot">
              <span className="wl-hint">
                {pick ? "Address confirmed. You can change the radius later." : "Choose an address from the dropdown to continue."}
              </span>
              <button className="wl-btn" onClick={addArea} disabled={!pick || saving}>
                {saving ? "Adding…" : "Add area"}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}