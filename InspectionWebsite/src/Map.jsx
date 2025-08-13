import React, { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./Map.css";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const COLORS = {
  red: "#ea4335",
  yellow: "#fbbc05",
  green: "#34a853",
  greenDark: "#0f9d58",
  zero: "#000000",
  null: "#657786",
};

const DRAW_ORDER = ["green", "yellow", "zero", "null", "red"];
const MIN_ZOOM = 11;

const SCORE_MIN = 1;
const SCORE_MAX = 99;
const RED_CAP = 98;
const YEL_CAP = 99;

function clampPins([r, y]) {
  r = Math.max(SCORE_MIN, Math.min(RED_CAP, Math.round(r)));
  y = Math.max(r + 1, Math.min(YEL_CAP, Math.round(y)));
  return [r, y];
}

// null-safe filters: range bands compare on a coalesced number; zero/null bands match exactly
function bandExprs([rMax, yMax]) {
  const GET = ["get", "score"];
  const GETN = ["coalesce", ["get", "score"], -999999]; // keeps nulls out of numeric comparisons
  return {
    red: ["all", [">=", GETN, 1], ["<=", GETN, rMax]],
    yellow: ["all", [">=", GETN, rMax + 1], ["<=", GETN, yMax]],
    green: ["all", [">=", GETN, yMax + 1], ["<=", GETN, 100]],
    zero: ["==", GET, 0],
    null: ["==", GET, null],
  };
}

function formatDateSafe(val) {
  if (!val) return "n/a";
  if (typeof val === "string") {
    const m = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
      return d.toLocaleDateString(undefined, { timeZone: "UTC" });
    }
  }
  try {
    const d = new Date(val);
    return isNaN(d.getTime()) ? String(val) : d.toLocaleDateString();
  } catch {
    return String(val);
  }
}

export default function Map() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);

  const popupRef = useRef(null);
  const lastHoverId = useRef(null);
  const pinnedRef = useRef(false);
  const docCloseHandlerRef = useRef(null);

  const [geoData, setGeoData] = useState(null);
  const [selected, setSelected] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");

  const [pins, setPins] = useState(clampPins([85, 94]));
  const pinsRef = useRef(pins);
  useEffect(() => { pinsRef.current = pins; }, [pins]);

  const [showZero, setShowZero] = useState(false);
  const [showNull, setShowNull] = useState(false);

  const [showRedPins, setShowRedPins] = useState(true);
  const [showYellowPins, setShowYellowPins] = useState(true);
  const [showGreenPins, setShowGreenPins] = useState(true);

  const [bandsOpen, setBandsOpen] = useState(false);

  const miniRef = useRef(null);
  const trackRef = useRef(null);
  const dragRef = useRef({ which: null, el: null, mode: "track" });

  useEffect(() => {
    (async () => {
      const { count, error: headErr } = await supabase
        .from("v_facility_map_feed")
        .select("*", { head: true, count: "exact" });
      if (headErr) { console.error(headErr); return; }

      const pageSize = 1000;
      let allRows = [];
      for (let offset = 0; offset < count; offset += pageSize) {
        const to = Math.min(count - 1, offset + pageSize - 1);
        const { data, error } = await supabase
          .from("v_facility_map_feed")
          .select(
            "establishment_id,premise_name,address,lon,lat,inspection_date_recent,score_recent,grade_recent"
          )
          .range(offset, to);
        if (error) { console.error(error); return; }
        allRows = allRows.concat(data);
      }

      const features = allRows
        .filter(r => typeof r.lon === "number" && typeof r.lat === "number")
        .map((r, i) => ({
          type: "Feature",
          id: i,
          geometry: { type: "Point", coordinates: [r.lon, r.lat] },
          properties: {
            establishment_id: r.establishment_id,
            name: r.premise_name,
            address: r.address,
            date: r.inspection_date_recent,
            score: r.score_recent,
            grade: r.grade_recent,
          },
        }));

      const latestMap = features.reduce((acc, feat) => {
        const eid = feat.properties.establishment_id;
        const prev = acc[eid];
        if (!prev || (feat.properties.date && feat.properties.date > prev.properties.date)) {
          acc[eid] = feat;
        }
        return acc;
      }, {});
      setGeoData({ type: "FeatureCollection", features: Object.values(latestMap) });
    })();
  }, []);

  function isMapReady() {
    const m = mapRef.current;
    if (!m || !m.isStyleLoaded()) return false;
    return DRAW_ORDER.every(k => m.getLayer(`points-${k}`));
  }
  function applyFilterWhenReady() {
    const m = mapRef.current;
    if (!m) return;
    if (isMapReady()) applyFilter(m);
    else m.once("idle", () => { if (isMapReady()) applyFilter(m); });
  }

  useEffect(() => {
    if (!geoData || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: [-85.75, 38.25],
      zoom: MIN_ZOOM,
      maxBounds: [[-86.4, 37.7], [-85.0, 38.7]],
    });
    mapRef.current = map;

    map.on("load", () => {
      map.addSource("facilities", { type: "geojson", data: geoData });

      const basePaint = {
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          8, window.innerWidth <= 600 ? 4 : 6,
          11, window.innerWidth <= 600 ? 8 : 10.5,
          14, window.innerWidth <= 600 ? 12 : 14,
          17, window.innerWidth <= 600 ? 16 : 18,
        ],
        "circle-opacity": 0.9,
        "circle-stroke-width": 2,
        "circle-stroke-color": "rgba(0,0,0,0.4)",
        "circle-blur": 0.25,
      };

      const exprs = bandExprs(pinsRef.current);
      for (const key of DRAW_ORDER) {
        map.addLayer({
          id: `points-${key}`,
          type: "circle",
          source: "facilities",
          paint: {
            ...basePaint,
            "circle-color":
              key === "green" ? COLORS.green :
              COLORS[key],
          },
          filter: exprs[key],
        });
      }

      const layerIds = DRAW_ORDER.map(k => `points-${k}`);

      const colorForScore = (score) => {
        const [rMax, yMax] = pinsRef.current;
        if (score == null) return COLORS.null;
        if (score === 0) return COLORS.zero;
        if (score === 100) return COLORS.greenDark;
        if (score <= rMax) return COLORS.red;
        if (score <= yMax) return COLORS.yellow;
        return COLORS.green;
      };

      const showPopup = (f) => {
        const { name, address, date, score, grade } = f.properties;
        const html =
          `<div class="popup-content" style="font-size:14px;max-width:220px">
             <strong>${name}</strong><br/>
             <small>${address}</small><br/>
             <small>Inspected: ${formatDateSafe(date)}</small><br/>
             Score: ${score != null ? score : 'n/a'}${grade ? ` (${grade})` : ''}
           </div>`;
        if (!popupRef.current) {
          popupRef.current = new maplibregl.Popup({
            anchor: "bottom",
            offset: [0, -14],
            closeButton: false,
            closeOnMove: false,
            closeOnClick: false,
          })
            .setLngLat(f.geometry.coordinates)
            .setHTML(html)
            .addTo(mapRef.current);
        } else {
          popupRef.current.setLngLat(f.geometry.coordinates).setHTML(html);
        }
        const tip = popupRef.current.getElement()?.querySelector(".maplibregl-popup-tip");
        if (tip) tip.style.borderTopColor = colorForScore(f.properties.score);
      };

      const onHover = (e) => {
        if (pinnedRef.current) return;
        if (!e.features.length) return;
        const f = e.features[0];
        if (f.id === lastHoverId.current) return;
        lastHoverId.current = f.id;
        showPopup(f);
      };

      const onLeave = () => {
        if (pinnedRef.current) return;
        popupRef.current?.remove();
        popupRef.current = null;
        lastHoverId.current = null;
      };

      const onClick = (e) => {
        const f = e.features[0];

        pinnedRef.current = false;
        popupRef.current?.remove();
        popupRef.current = null;

        const p = f.properties;
        setSelected({
          name: p.name,
          address: p.address,
          inspectionDate: formatDateSafe(p.date),
          score: p.score ?? "n/a",
          grade: p.grade ?? "",
        });
      };

      for (const id of layerIds) {
        map.on("mousemove", id, onHover);
        map.on("mouseleave", id, onLeave);
        map.on("click", id, onClick);
        map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
      }

      map.on("click", e => {
        const hits = map.queryRenderedFeatures(e.point, { layers: layerIds });
        if (!hits.length) {
          pinnedRef.current = false;
          popupRef.current?.remove();
          popupRef.current = null;
          lastHoverId.current = null;
          setSelected(null);
        }
      });

      const outsideClose = (ev) => {
        const el = popupRef.current?.getElement();
        if (!el) return;
        if (!el.contains(ev.target)) {
          pinnedRef.current = false;
          popupRef.current?.remove();
          popupRef.current = null;
          lastHoverId.current = null;
        }
      };
      document.addEventListener("mousedown", outsideClose, true);
      docCloseHandlerRef.current = outsideClose;

      applyFilter(map);
    });

    return () => {
      if (docCloseHandlerRef.current) {
        document.removeEventListener("mousedown", docCloseHandlerRef.current, true);
        docCloseHandlerRef.current = null;
      }
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [geoData]);

  useEffect(() => {
    if (mapRef.current) applyFilterWhenReady();
  }, [pins, showZero, showNull, searchTerm, showRedPins, showYellowPins, showGreenPins]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    m.resize();
    const t = setTimeout(() => m.resize(), 320);
    return () => clearTimeout(t);
  }, [bandsOpen]);

  const [miniActive, setMiniActive] = useState(null);
  const [activeHandle, setActiveHandle] = useState(null);
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const dragging = miniActive != null || activeHandle != null || bandsOpen;
    const stopWheel = (e) => e.preventDefault();
    if (dragging) {
      m.dragPan.disable();
      m.scrollZoom.disable();
      m.boxZoom.disable();
      m.keyboard.disable();
      document.body.style.overflow = "hidden";
      window.addEventListener("wheel", stopWheel, { passive: false });
    }
    return () => {
      window.removeEventListener("wheel", stopWheel);
      document.body.style.overflow = "";
      m.dragPan.enable();
      m.scrollZoom.enable();
      m.boxZoom.enable();
      m.keyboard.enable();
    };
  }, [miniActive, activeHandle, bandsOpen]);

  useEffect(() => {
    if (selected === null) {
      pinnedRef.current = false;
      popupRef.current?.remove();
      popupRef.current = null;
      lastHoverId.current = null;
    }
  }, [selected]);

  const MINI_GAMMA = 1.8;
  const TRACK_GAMMA = 2;

  const warpMini = (t) => Math.pow(t, MINI_GAMMA);
  const unwarpMini = (t) => Math.pow(t, 1 / MINI_GAMMA);

  const warpTrack = (t) => Math.pow(t, TRACK_GAMMA);
  const unwarpTrack = (t) => Math.pow(t, 1 / TRACK_GAMMA);

  const valueToMiniPct = (v) => warpMini(v / SCORE_MAX) * 100;
  const pctToValueMini = (pct) => {
    const v = Math.round(unwarpMini(pct / 100) * SCORE_MAX);
    return Math.max(SCORE_MIN, Math.min(YEL_CAP, v));
  };
  const pxToValueMini = (clientX, el) => {
    const rect = el.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    const pct = Math.max(0, Math.min(1, ratio)) * 100;
    return pctToValueMini(pct);
  };

  const valueToTrackPct = (v) => warpTrack(v / SCORE_MAX) * 100;
  const pctToValueTrack = (pct) => {
    const v = Math.round(unwarpTrack(pct / 100) * SCORE_MAX);
    return Math.max(SCORE_MIN, Math.min(YEL_CAP, v));
  };
  const pxToValueTrack = (clientX, el) => {
    const rect = el.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    const pct = Math.max(0, Math.min(1, ratio)) * 100;
    return pctToValueTrack(pct);
  };

  const [rMax, yMax] = pins;

  const pRMini = valueToMiniPct(rMax);
  const pYMini = valueToMiniPct(yMax);

  const wRedMini = warpMini(rMax / SCORE_MAX) * 100;
  const wYellowMini = Math.max(0, (warpMini(yMax / SCORE_MAX) - warpMini(rMax / SCORE_MAX)) * 100);
  const wGreenMini = Math.max(0, (1 - warpMini(yMax / SCORE_MAX)) * 100);

  const pRTrack = valueToTrackPct(rMax);
  const pYTrack = valueToTrackPct(yMax);

  const wRed = warpTrack(rMax / SCORE_MAX) * 100;
  const wYellow = Math.max(0, (warpTrack(yMax / SCORE_MAX) - warpTrack(rMax / SCORE_MAX)) * 100);
  const wGreen = Math.max(0, (1 - warpTrack(yMax / SCORE_MAX)) * 100);

  // back in scope and used by map + state effects
  function applyFilter(map) {
    const exprs = bandExprs(pins);
    const term = searchTerm.trim().toLowerCase();
    const searchExpr = term ? [">=", ["index-of", term, ["downcase", ["get", "name"]]], 0] : null;
    const hidden = ["==", ["get", "score"], "__none__"];

    for (const key of DRAW_ORDER) {
      const id = `points-${key}`;
      let visible = true;
      if (key === "zero" && !showZero) visible = false;
      if (key === "null" && !showNull) visible = false;
      if (key === "red" && !showRedPins) visible = false;
      if (key === "yellow" && !showYellowPins) visible = false;
      if (key === "green" && !showGreenPins) visible = false;

      const f = searchExpr ? ["all", exprs[key], searchExpr] : exprs[key];
      map.setFilter(id, visible ? f : hidden);

      if (key === "green") {
        map.setPaintProperty(
          id,
          "circle-color",
          ["case", ["==", ["get", "score"], 100], COLORS.greenDark, COLORS.green]
        );
      }
    }
  }

  function dragStart(which, el, clientX, mode = "track") {
    dragRef.current = { which, el, mode };
    if (typeof clientX === "number") dragMove(clientX);
    const move = (ev) => dragMove(ev.clientX);
    const up = () => {
      dragRef.current = { which: null, el: null, mode: "track" };
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setActiveHandle(null);
      setMiniActive(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  }
  function dragMove(clientX) {
    const { which, el, mode } = dragRef.current;
    if (!el || which == null) return;
    const v = mode === "mini" ? pxToValueMini(clientX, el) : pxToValueTrack(clientX, el);
    setPins(prev => {
      let [r, y] = prev;
      if (which === 0) r = Math.min(v, y - 1);
      else y = Math.max(r + 1, v);
      return clampPins([r, y]);
    });
  }

  return (
    <>
      <div ref={mapContainerRef} className="map-container" />

      <div className="controls">
        <div className="control-card">
          <div className="search-bar">
            <svg viewBox="0 0 24 24" className="icon" aria-hidden="true">
              <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79L20 21.5 21.5 20 15.5 14zM9.5 14A4.5 4.5 0 1 1 14 9.5 4.505 4.505 0 0 1 9.5 14z" fill="currentColor"/>
            </svg>
            <input
              type="text"
              placeholder="Search by name"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="rgb-toggles">
            <div className="rgb-row">
              <span className="label">Show Red</span>
              <label className="switch sm red">
                <input
                  type="checkbox"
                  checked={showRedPins}
                  onChange={e => setShowRedPins(e.target.checked)}
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
                  onChange={e => setShowYellowPins(e.target.checked)}
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
                  onChange={e => setShowGreenPins(e.target.checked)}
                />
                <span />
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="fab-scores">
        <div className="fab-row">
          <span>Scores</span>

          <div
            className={`mini-bar ${miniActive != null ? "dragging" : ""}`}
            ref={miniRef}
            onPointerDown={e => {
              const el = miniRef.current;
              const v = pxToValueMini(e.clientX, el);
              const [r, y] = pinsRef.current;
              const which = Math.abs(v - r) <= Math.abs(v - y) ? 0 : 1;
              setPins(prev => {
                let [r2, y2] = prev;
                if (which === 0) r2 = Math.min(v, y2 - 1);
                else y2 = Math.max(r2 + 1, v);
                return clampPins([r2, y2]);
              });
              setMiniActive(which);
              dragStart(which, miniRef.current, e.clientX, "mini");
              const move = (ev) => dragMove(ev.clientX);
              const up = () => {
                setMiniActive(null);
                window.removeEventListener("pointermove", move);
              };
              window.addEventListener("pointermove", move);
              window.addEventListener("pointerup", up, { once: true });
            }}
          >
            <div className="mini-seg red" style={{ width: `${wRedMini}%` }} />
            <div className="mini-seg yellow" style={{ width: `${wYellowMini}%` }} />
            <div className="mini-seg green" style={{ width: `${wGreenMini}%` }} />

            <div
              className={`mini-handle ${miniActive === 0 ? "active" : ""}`}
              style={{ "--pos": `${pRMini}%` }}
              onPointerDown={(e) => {
                e.stopPropagation();
                setMiniActive(0);
                dragStart(0, miniRef.current, e.clientX, "mini");
                const move = (ev) => dragMove(ev.clientX);
                const up = () => {
                  setMiniActive(null);
                  window.removeEventListener("pointermove", move);
                };
                window.addEventListener("pointermove", move);
                window.addEventListener("pointerup", up, { once: true });
              }}
            >
              <span>{pins[0]}</span>
            </div>
            <div
              className={`mini-handle ${miniActive === 1 ? "active" : ""}`}
              style={{ "--pos": `${pYMini}%` }}
              onPointerDown={(e) => {
                e.stopPropagation();
                setMiniActive(1);
                dragStart(1, miniRef.current, e.clientX, "mini");
                const move = (ev) => dragMove(ev.clientX);
                const up = () => {
                  setMiniActive(null);
                  window.removeEventListener("pointermove", move);
                };
                window.addEventListener("pointermove", move);
                window.addEventListener("pointerup", up, { once: true });
              }}
            >
              <span>{pins[1]}</span>
            </div>
          </div>
        </div>

        <div className="fab-sub">
          {`R 1–${pins[0]} · Y ${pins[0] + 1}–${pins[1]} · G ${pins[1] + 1}–100`}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="fab-open" onClick={() => setBandsOpen(true)}>Adjust</button>
        </div>
      </div>

      <div className={`bands ${bandsOpen ? "open" : ""}`}>
        <div className="bands-backdrop" onClick={() => setBandsOpen(false)} />
        <div className="bands-sheet">
          <div className="bands-header">
            <div className="grab" />
            <div className="title">Score Bands</div>
          </div>

          <div className="presets">
            <button onClick={() => setPins(clampPins([80, 92]))}>Loose</button>
            <button onClick={() => setPins(clampPins([85, 94]))}>Balanced</button>
            <button onClick={() => setPins(clampPins([90, 96]))}>Strict</button>
          </div>

          <div className="band-editor">
            <div
              className={`track ${activeHandle != null ? "dragging" : ""}`}
              ref={trackRef}
              onPointerDown={e => {
                const el = trackRef.current;
                const v = pxToValueTrack(e.clientX, el);
                const [r, y] = pinsRef.current;
                const which = Math.abs(v - r) <= Math.abs(v - y) ? 0 : 1;
                setActiveHandle(which);
                setPins(prev => {
                  let [r2, y2] = prev;
                  if (which === 0) r2 = Math.min(v, y2 - 1);
                  else y2 = Math.max(r2 + 1, v);
                  return clampPins([r2, y2]);
                });
                dragStart(which, el, e.clientX, "track");
              }}
            >
              <div className="seg red" style={{ width: `${wRed}%` }} />
              <div className="seg yellow" style={{ width: `${wYellow}%` }} />
              <div className="seg green" style={{ width: `${wGreen}%` }} />

              <div className="ruler">
                {Array.from({ length: 97 }, (_, i) => i + 2).map(v => (
                  <div key={`m-${v}`} className="tick minor" style={{ left: `${valueToTrackPct(v)}%` }} />
                ))}
                {Array.from({ length: 20 }, (_, i) => 5 * i + 5)
                  .filter(v => v >= SCORE_MIN && v <= SCORE_MAX)
                  .map(v => (
                    <div key={`M-${v}`} className="major-wrap" style={{ left: `${valueToTrackPct(v)}%` }}>
                      <div className="tick major" />
                      <div className="tick-label">{v}</div>
                    </div>
                  ))}
              </div>

              <div
                className={`handle ${activeHandle === 0 ? "active" : ""}`}
                style={{ "--pos": `${pRTrack}%` }}
                onPointerDown={(e) => {
                  setActiveHandle(0);
                  dragStart(0, trackRef.current, e.clientX, "track");
                }}
              >
                <span className="label">{pins[0]}</span>
              </div>
              <div
                className={`handle ${activeHandle === 1 ? "active" : ""}`}
                style={{ "--pos": `${pYTrack}%` }}
                onPointerDown={(e) => {
                  setActiveHandle(1);
                  dragStart(1, trackRef.current, e.clientX, "track");
                }}
              >
                <span className="label">{pins[1]}</span>
              </div>
            </div>

            <div className="legend">
              <div><span className="sw" style={{ background: COLORS.red }} />{`1–${pins[0]}`}</div>
              <div><span className="sw" style={{ background: COLORS.yellow }} />{`${pins[0] + 1}–${pins[1]}`}</div>
              <div><span className="sw" style={{ background: COLORS.greenDark }} />{`${pins[1] + 1}–100`}</div>
            </div>
          </div>

          <div className="toggles">
            <label className="switch">
              <input type="checkbox" checked={showZero} onChange={e => setShowZero(e.target.checked)} />
              <span /> Show 0
            </label>
            <label className="switch">
              <input type="checkbox" checked={showNull} onChange={e => setShowNull(e.target.checked)} />
              <span /> Show null
            </label>
          </div>

          <div className="sheet-actions">
            <button className="ghost" onClick={() => setBandsOpen(false)}>Done</button>
          </div>
        </div>
      </div>

      {selected && (
        <div
          className="info-drawer"
          style={{
            position: "fixed",
            right: 16,
            top: 16,
            bottom: 16,
            width: "min(420px, 90vw)",
            background: "rgba(24,24,24,0.96)",
            backdropFilter: "blur(6px)",
            color: "#fff",
            zIndex: 5,
            borderRadius: 12,
            boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
            overflow: "auto",
            padding: 16
          }}
        >
          <button
            className="info-close"
            onClick={() => setSelected(null)}
            style={{
              position: "absolute",
              right: 10,
              top: 6,
              border: "none",
              background: "transparent",
              color: "#bbb",
              fontSize: 24,
              cursor: "pointer"
            }}
            aria-label="Close"
            title="Close"
          >
            ×
          </button>
          <h2 className="info-title" style={{ marginTop: 6 }}>{selected.name}</h2>
          <div className="info-detail"><span className="label">Address</span><span className="value">{selected.address}</span></div>
          <div className="info-detail"><span className="label">Inspected</span><span className="value">{selected.inspectionDate}</span></div>
          <div className="info-detail"><span className="label">Score</span><span className="value">{selected.score}</span></div>
          {selected.grade && (
            <div className="info-detail"><span className="label">Grade</span><span className="value">{selected.grade}</span></div>
          )}
        </div>
      )}
    </>
  );
}
