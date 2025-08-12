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

// bottom → top (worse on top)
const DRAW_ORDER = ["green", "eq100", "yellow", "zero", "null", "red"];

const MIN_ZOOM = 11;
const TARGET_ZOOM = 13.5;

const SCORE_MIN = 1;
const SCORE_MAX = 99;
const RED_CAP = 98;   // red handle ≤ 98
const YEL_CAP = 99;   // yellow handle ≤ 99 (100 is its own class)

function clampPins([r, y]) {
  r = Math.max(SCORE_MIN, Math.min(RED_CAP, Math.round(r)));
  y = Math.max(r + 1, Math.min(YEL_CAP, Math.round(y)));
  return [r, y];
}

function bandExprs([rMax, yMax]) {
  const GET = ["get", "score"];
  return {
    red: ["all", [">=", GET, 1], ["<=", GET, rMax]],
    yellow: ["all", [">=", GET, rMax + 1], ["<=", GET, yMax]],
    green: ["all", [">", GET, 1000], ["<", GET, -1000]], // none (kept for stacking baseline)
    eq100: ["==", GET, 100],
    zero: ["==", GET, 0],
    null: ["==", GET, null],
  };
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

  const [autoZoom, setAutoZoom] = useState(true);
  const autoZoomRef = useRef(true);
  useEffect(() => { autoZoomRef.current = autoZoom; }, [autoZoom]);

  const [searchTerm, setSearchTerm] = useState("");

  // two handles: [Rmax, Ymax]
  const [pins, setPins] = useState(clampPins([85, 94]));
  const pinsRef = useRef(pins);
  useEffect(() => { pinsRef.current = pins; }, [pins]);

  const [showZero, setShowZero] = useState(false);
  const [showNull, setShowNull] = useState(false);
  const [bandsOpen, setBandsOpen] = useState(false);

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

      // latest per establishment
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
                key === "eq100" ? COLORS.greenDark :
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
             <small>Inspected: ${date ? new Date(date).toLocaleDateString() : 'n/a'}</small><br/>
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

      const zoomToCluster = (e) => {
        const point = e.point;
        const bbox = [[point.x - 100, point.y - 100], [point.x + 100, point.y + 100]];
        const nearby = map.queryRenderedFeatures(bbox, { layers: layerIds });
        const curr = map.getZoom();
        const coords = e.features[0].geometry.coordinates;

        if (nearby.length <= 1) {
          map.easeTo({
            center: coords,
            zoom: Math.max(MIN_ZOOM, curr - 0.4),
            duration: 650,
            easing: t => 1 - Math.pow(1 - t, 2)
          });
          return;
        }

        let dz = 0.9;
        if (nearby.length > 10) dz = 1.2;
        if (nearby.length > 30) dz = 1.5;

        const target = Math.min(TARGET_ZOOM, curr + dz);

        const lons = nearby.map(f => f.geometry.coordinates[0]);
        const lats = nearby.map(f => f.geometry.coordinates[1]);
        const avgLon = lons.reduce((s, x) => s + x, 0) / lons.length;
        const avgLat = lats.reduce((s, y) => s + y, 0) / lats.length;
        const bias = 0.18;
        const center = [
          coords[0] + (avgLon - coords[0]) * bias,
          coords[1] + (avgLat - coords[1]) * bias,
        ];

        map.easeTo({
          center,
          zoom: target,
          duration: 750,
          easing: t => 1 - Math.pow(1 - t, 2)
        });
      };

      const onClick = (e) => {
        const f = e.features[0];
        if (pinnedRef.current && popupRef.current) {
          pinnedRef.current = false;
          popupRef.current.remove();
          popupRef.current = null;
          return;
        }
        if (autoZoomRef.current) zoomToCluster(e);
        showPopup(f);
        pinnedRef.current = true;
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
  }, [pins, showZero, showNull, searchTerm]);

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

  function applyFilter(map) {
    const exprs = bandExprs(pins);
    const term = searchTerm.trim().toLowerCase();
    const searchExpr = term ? ["in", term, ["downcase", ["get", "name"]]] : null;
    const hidden = ["==", ["get", "score"], "__none__"];

    for (const key of DRAW_ORDER) {
      const id = `points-${key}`;
      let visible = true;
      if (key === "zero" && !showZero) visible = false;
      if (key === "null" && !showNull) visible = false;
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

  // slider utils
  const valueToPct = (v) => (v / SCORE_MAX) * 100;
  const pctToValue = (pct) => {
    const v = Math.round((pct / 100) * SCORE_MAX);
    return Math.max(SCORE_MIN, Math.min(YEL_CAP, v));
  };
  const pxToValue = (clientX, el) => {
    const rect = el.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    const pct = Math.max(0, Math.min(1, ratio)) * 100;
    return pctToValue(pct);
  };

  const [rMax, yMax] = pins;
  const pR = valueToPct(rMax);
  const pY = valueToPct(yMax);

  function applyPreset(r, y) { setPins(clampPins([r, y])); }

  // mini pill drag
  const miniRef = useRef(null);
  function miniStart(which, e) {
    setMiniActive(which);
    dragStart(which, miniRef.current, e.clientX);
  }
  function miniMove(e) { dragMove(e.clientX); }
  function miniEnd() {
    setMiniActive(null);
    window.removeEventListener("pointermove", miniMove);
  }
  function miniBarDown(e) {
    const el = miniRef.current;
    const v = pxToValue(e.clientX, el);
    const [r, y] = pinsRef.current;
    const which = Math.abs(v - r) <= Math.abs(v - y) ? 0 : 1;
    setPins(prev => {
      let [r2, y2] = prev;
      if (which === 0) r2 = Math.min(v, y2 - 1);
      else y2 = Math.max(r2 + 1, v);
      return clampPins([r2, y2]);
    });
    miniStart(which, e);
    window.addEventListener("pointermove", miniMove);
    window.addEventListener("pointerup", miniEnd, { once: true });
  }

  // sheet drag
  const trackRef = useRef(null);
  function trackDown(e) {
    const el = trackRef.current;
    const v = pxToValue(e.clientX, el);
    const [r, y] = pinsRef.current;
    const which = Math.abs(v - r) <= Math.abs(v - y) ? 0 : 1;
    setActiveHandle(which);
    setPins(prev => {
      let [r2, y2] = prev;
      if (which === 0) r2 = Math.min(v, y2 - 1);
      else y2 = Math.max(r2 + 1, v);
      return clampPins([r2, y2]);
    });
    dragStart(which, el, e.clientX);
  }
  function handleDown(which, e) {
    setActiveHandle(which);
    dragStart(which, trackRef.current, e.clientX);
  }

  const dragRef = useRef({ which: null, el: null });
  function dragStart(which, el, clientX) {
    dragRef.current = { which, el };
    if (typeof clientX === "number") dragMove(clientX);
    const move = (ev) => dragMove(ev.clientX);
    const up = () => {
      dragRef.current = { which: null, el: null };
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setActiveHandle(null);
      setMiniActive(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  }
  function dragMove(clientX) {
    const { which, el } = dragRef.current;
    if (!el || which == null) return;
    const v = pxToValue(clientX, el);
    setPins(prev => {
      let [r, y] = prev;
      if (which === 0) r = Math.min(v, y - 1);
      else y = Math.max(r + 1, v);
      return clampPins([r, y]);
    });
  }

  const MAJOR_TICKS = Array.from({ length: 20 }, (_, i) => 5 * i + 5)
    .filter(v => v >= SCORE_MIN && v <= SCORE_MAX);
  const MINOR_TICKS = Array.from({ length: 97 }, (_, i) => i + 2);

  // editor segment widths
  const wRed = pR;
  const wYellow = Math.max(0, pY - pR);
  const wGreen = Math.max(0, 100 - pY);

  return (
    <>
      <div ref={mapContainerRef} className="map-container" />

      <div className="controls">
        <div className="search-bar">
          <span className="icon">🔍</span>
          <input
            type="text"
            placeholder="Search…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <label className="autozoom">
          <input
            type="checkbox"
            checked={autoZoom}
            onChange={e => setAutoZoom(e.target.checked)}
          />
          Auto-zoom
        </label>
      </div>

      {/* Scores pill (mini view) */}
      <div className="fab-scores">
        <div className="fab-row">
          <span>Scores</span>

          <div
            className={`mini-bar ${miniActive != null ? "dragging" : ""}`}
            ref={miniRef}
            onPointerDown={miniBarDown}
          >
            {/* REAL segments so the mini view always mirrors thresholds */}
            <div className="mini-seg red" style={{ width: `${wRed}%` }} />
            <div className="mini-seg yellow" style={{ width: `${wYellow}%` }} />
            <div className="mini-seg green" style={{ width: `${wGreen}%` }} />

            <div
              className={`mini-handle ${miniActive === 0 ? "active" : ""}`}
              style={{ left: `${pR}%` }}
              onPointerDown={(e) => {
                e.stopPropagation();
                miniStart(0, e);
                window.addEventListener("pointermove", miniMove);
                window.addEventListener("pointerup", miniEnd, { once: true });
              }}
            >
              <span>{pins[0]}</span>
            </div>
            <div
              className={`mini-handle ${miniActive === 1 ? "active" : ""}`}
              style={{ left: `${pY}%` }}
              onPointerDown={(e) => {
                e.stopPropagation();
                miniStart(1, e);
                window.addEventListener("pointermove", miniMove);
                window.addEventListener("pointerup", miniEnd, { once: true });
              }}
            >
              <span>{pins[1]}</span>
            </div>
          </div>
        </div>

        <div className="fab-sub">
          {`R 1–${pins[0]} · Y ${pins[0] + 1}–${pins[1]} · G 100`}
        </div>

        <button className="fab-open" onClick={() => setBandsOpen(true)}>Adjust</button>
      </div>

      {/* Bottom-sheet editor */}
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
              onPointerDown={trackDown}
            >
              {/* colored bands */}
              <div className="seg red" style={{ width: `${wRed}%` }} />
              <div className="seg yellow" style={{ width: `${wYellow}%` }} />
              <div className="seg green" style={{ width: `${wGreen}%` }} />

              {/* ruler */}
              <div className="ruler">
                {MINOR_TICKS.map(v => (
                  <div
                    key={`m-${v}`}
                    className="tick minor"
                    style={{ left: `${(v / SCORE_MAX) * 100}%` }}
                  />
                ))}
                {MAJOR_TICKS.map(v => (
                  <div key={`M-${v}`} className="major-wrap" style={{ left: `${(v / SCORE_MAX) * 100}%` }}>
                    <div className="tick major" />
                    <div className="tick-label">{v}</div>
                  </div>
                ))}
              </div>

              {/* handles */}
              <div
                className={`handle ${activeHandle === 0 ? "active" : ""}`}
                style={{ left: `${pR}%` }}
                onPointerDown={(e) => handleDown(0, e)}
              >
                <span className="label">{pins[0]}</span>
              </div>
              <div
                className={`handle ${activeHandle === 1 ? "active" : ""}`}
                style={{ left: `${pY}%` }}
                onPointerDown={(e) => handleDown(1, e)}
              >
                <span className="label">{pins[1]}</span>
              </div>
            </div>

            <div className="legend">
              <div><span className="sw" style={{ background: COLORS.red }} />{`1–${pins[0]}`}</div>
              <div><span className="sw" style={{ background: COLORS.yellow }} />{`${pins[0] + 1}–${pins[1]}`}</div>
              <div><span className="sw" style={{ background: COLORS.greenDark }} />100</div>
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
        <div className="info-overlay" onClick={() => setSelected(null)}>
          <div className="info-drawer" onClick={e => e.stopPropagation()}>
            <button className="info-close" onClick={() => setSelected(null)}>×</button>
            <h2 className="info-title">{selected.name}</h2>
            <div className="info-detail">
              <span className="label">Address</span>
              <span className="value">{selected.address}</span>
            </div>
            <div className="info-detail">
              <span className="label">Inspected</span>
              <span className="value">{selected.inspectionDate}</span>
            </div>
            <div className="info-detail">
              <span className="label">Score</span>
              <span className="value">{selected.score}</span>
            </div>
            {selected.grade && (
              <div className="info-detail">
                <span className="label">Grade</span>
                <span className="value">{selected.grade}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
