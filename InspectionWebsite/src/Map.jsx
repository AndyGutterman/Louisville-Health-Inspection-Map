import React, { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./Map.css";
import { createClient } from "@supabase/supabase-js";
import { getCircleColorExpression } from "./styleUtils";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export default function Map() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const popupRef = useRef(null);
  const hideTimeout = useRef(null);
  const lastHoverId = useRef(null);
  const pinnedRef = useRef(false);
  const hoverFeatureRef = useRef(null);
  const lastClickIdRef = useRef(null);

  const [geoData, setGeoData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [showPurple, setShowPurple] = useState(false);
  const [showNull, setShowNull] = useState(false);
  const [autoZoom, setAutoZoom] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const autoZoomRef = useRef(autoZoom);
  useEffect(() => { autoZoomRef.current = autoZoom }, [autoZoom]);

  const HIDE_DELAY = 150;
  const TARGET_ZOOM = 14;
  const MIN_ZOOM = 11;

  // fetch and prepare geoData
  useEffect(() => {
    (async () => {
      const { count, error: headErr } = await supabase
        .from("v_facility_map_feed")
        .select("*", { head: true, count: "exact" });
      if (headErr) return console.error(headErr);

      const pageSize = 1000;
      let allRows = [];
      for (let offset = 0; offset < count; offset += pageSize) {
        const to = Math.min(count - 1, offset + pageSize - 1);
        const { data, error } = await supabase
          .from("v_facility_map_feed")
          .select(
            `establishment_id,premise_name,address,lon,lat,inspection_date_recent,score_recent,grade_recent`
          )
          .range(offset, to);
        if (error) return console.error(error);
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

  // initialize map & layers
  useEffect(() => {
    if (!geoData || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: [-85.75, 38.25],
      zoom: MIN_ZOOM,
    });
    mapRef.current = map;

    const isMobile = window.matchMedia("(pointer: coarse)").matches;
    let mousePos = null;
    let animId = null;
    const margin = 150, maxSpeed = 12;

    function animatePan() {
      if (!isMobile && mousePos) {
        const rect = map.getContainer().getBoundingClientRect();
        const { x, y } = mousePos;
        let dx = 0, dy = 0;
        if (x < margin) dx = -maxSpeed * (1 - x / margin);
        else if (x > rect.width - margin) dx = maxSpeed * (1 - (rect.width - x) / margin);
        if (y < margin) dy = -maxSpeed * (1 - y / margin);
        else if (y > rect.height - margin) dy = maxSpeed * (1 - (rect.height - y) / margin);
        if (dx || dy) map.panBy([dx, dy], { duration: 0 });
      }
      animId = requestAnimationFrame(animatePan);
    }

    map.on("load", () => {
      map.addSource("facilities", { type: "geojson", data: geoData });
      map.addLayer({
        id: "points",
        type: "circle",
        source: "facilities",
        paint: {
          "circle-color": getCircleColorExpression(),
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
        }
      });

      map.on("mousemove", "points", onHover);
      map.on("mouseleave", "points", hidePopup);
      map.on("click", "points", onClick);
      map.on("mouseenter", "points", () => map.getCanvas().style.cursor = "pointer");
      map.on("mouseleave", "points", () => map.getCanvas().style.cursor = "");

      map.on("click", e => {
        const hits = map.queryRenderedFeatures(e.point, { layers: ["points"] });
        if (!hits.length) {
          pinnedRef.current = false;
          popupRef.current?.remove();
          popupRef.current = null;
          lastHoverId.current = null;
          hoverFeatureRef.current = null;
        }
      });

      applyFilter(map);
      animatePan();
    });

    return () => {
      cancelAnimationFrame(animId);
      map.remove();
    };
  }, [geoData]);

  // reapply on search or toggles
  useEffect(() => {
    if (mapRef.current) applyFilter(mapRef.current);
  }, [showPurple, showNull, searchTerm]);

  function applyFilter(map) {
    const filters = ["all"];

    if (!showPurple) {
      filters.push([
        "!",
        ["all",
          ["!=", ["get", "score"], null],
          ["<", ["get", "score"], 25]
        ]
      ]);
    }

    if (!showNull) {
      filters.push(["!", ["==", ["get", "score"], null]]);
    }

    const term = searchTerm.trim().toLowerCase();
    if (term) {
      filters.push([
        "in",
        term,
        ["downcase", ["get", "name"]]
      ]);

    }

    map.setFilter("points", filters);
  }

  useEffect(() => {
    if (selected === null) {
      pinnedRef.current = false;
      popupRef.current?.remove();
      popupRef.current = null;
      lastHoverId.current = null;
      hoverFeatureRef.current = null;
    }
  }, [selected]);

  function zoomToCluster(e) {
    const map = mapRef.current;
    const point = e.point;
    const bbox = [[point.x - 100, point.y - 100], [point.x + 100, point.y + 100]];
    const nearby = map.queryRenderedFeatures(bbox, { layers: ["points"] });
    const curr = map.getZoom();
    const coords = e.features[0].geometry.coordinates;

    if (nearby.length <= 1) {
      map.easeTo({ center: coords, zoom: Math.max(MIN_ZOOM, curr - 1), duration: 600 });
      return;
    }

    let zl = TARGET_ZOOM - 1;
    if (nearby.length > 30) zl = TARGET_ZOOM + 0.5;
    else if (nearby.length > 10) zl = TARGET_ZOOM;

    const lons = nearby.map(f => f.geometry.coordinates[0]);
    const lats = nearby.map(f => f.geometry.coordinates[1]);
    const avgLon = lons.reduce((s, x) => s + x, 0) / lons.length;
    const avgLat = lats.reduce((s, y) => s + y, 0) / lats.length;
    const bias = 0.2;
    const center = [
      coords[0] + (avgLon - coords[0]) * bias,
      coords[1] + (avgLat - coords[1]) * bias
    ];

    map.easeTo({ center, zoom: curr < zl ? zl : curr, duration: 600 });
  }

  function handlePopupClick() {
    const f = hoverFeatureRef.current;
    if (!f) return;
    setSelected({
      name: f.properties.name,
      address: f.properties.address,
      inspectionDate: f.properties.date
        ? new Date(f.properties.date).toLocaleDateString()
        : "n/a",
      score: f.properties.score != null ? f.properties.score : "n/a",
      grade: f.properties.grade,
    });
    pinnedRef.current = true;
  }

  function onHover(e) {
    if (pinnedRef.current) return;
    if (!e.features.length) return hidePopup();
    const f = e.features[0];
    if (f.id === lastHoverId.current) return;
    lastHoverId.current = f.id;
    hoverFeatureRef.current = f;

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
      popupRef.current.getElement().addEventListener("click", handlePopupClick);
    } else {
      popupRef.current.setLngLat(f.geometry.coordinates).setHTML(html);
    }
  }

  function hidePopup() {
    if (pinnedRef.current) return;
    clearTimeout(hideTimeout.current);
    hideTimeout.current = setTimeout(() => {
      popupRef.current?.remove();
      popupRef.current = null;
      lastHoverId.current = null;
    }, HIDE_DELAY);
  }

  function onClick(e) {
    const f = e.features[0];
    hoverFeatureRef.current = f;
    const same = lastClickIdRef.current === f.id;
    if (same && pinnedRef.current) {
      handlePopupClick();
      return;
    }
    lastClickIdRef.current = f.id;
    if (autoZoomRef.current) zoomToCluster(e);

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
      popupRef.current.getElement().addEventListener("click", handlePopupClick);
    } else {
      popupRef.current.setLngLat(f.geometry.coordinates).setHTML(html);
    }

    pinnedRef.current = true;
  }

  return (
    <>
      <div ref={mapContainerRef} className="map-container" />

      <div className="controls">
        <div className="search-group">
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

        <div className="filters">
          <label>
            <input
              type="checkbox"
              checked={showPurple}
              onChange={e => setShowPurple(e.target.checked)}
            />
            Show purple (&lt;25)
          </label>
          <label>
            <input
              type="checkbox"
              checked={showNull}
              onChange={e => setShowNull(e.target.checked)}
            />
            Show null
          </label>
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
