import React, { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./Map.css";
import { createClient } from "@supabase/supabase-js";
import { getCircleColorExpression } from "./styleUtils";

// initialize Supabase from env
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const isMobile = window.innerWidth <= 600;
const circlePaintStyles = {
  "circle-color": getCircleColorExpression(),
  "circle-radius": [
    "interpolate", ["linear"], ["zoom"],
       8, isMobile ? 4  : 6,
      11, isMobile ? 8  : 10.5,
      14, isMobile ? 12 : 14,
      17, isMobile ? 16 : 18
  ],
  "circle-opacity":      0.9,
  "circle-stroke-width": 2,
  "circle-stroke-color": "rgba(0,0,0,0.4)",
  "circle-blur":         0.25,
};

export default function Map() {
  const mapContainerRef = useRef(null);
  const mapRef          = useRef(null);
  const popupRef        = useRef(null);
  const hideTimeout     = useRef(null);
  const lastHoverId     = useRef(null);

  const [geoData, setGeoData]   = useState(null);
  const [selected, setSelected] = useState(null);
  const HIDE_DELAY = 150;

  useEffect(() => {
    (async () => {
      // 1) get exact count
      const { count, error: headErr } = await supabase
        .from("v_facility_map_feed")
        .select("*", { head: true, count: "exact" });
      if (headErr) {
        console.error("Error fetching total count:", headErr);
        return;
      }
      console.log("Total rows in view:", count);

      // 2) page‐through in 1000-row chunks
      const pageSize = 1000;
      let allRows = [];
      for (let offset = 0; offset < count; offset += pageSize) {
        const to = Math.min(count - 1, offset + pageSize - 1);
        console.log(`Fetching rows ${offset}–${to}…`);
        const { data, error } = await supabase
          .from("v_facility_map_feed")
          .select(`
            establishment_id,
            name,
            address,
            lon,
            lat,
            inspection_date,
            score,
            grade
          `)
          .range(offset, to);

        if (error) {
          console.error(`Error fetching range ${offset}–${to}:`, error);
          return;
        }
        allRows = allRows.concat(data);
      }

      console.log(`Pulled ${allRows.length}/${count} records from Supabase.`);

      // 3) convert into GeoJSON (drop any w/o coords)
      const features = allRows
        .filter(r => typeof r.lon === "number" && typeof r.lat === "number")
        .map((r, i) => ({
          type: "Feature",
          id:   i,
          geometry: { type: "Point", coordinates: [r.lon, r.lat] },
          properties: {
            name:    r.name,
            address: r.address,
            date:    r.inspection_date,
            score:   r.score,
            grade:   r.grade,
          }
        }));

      setGeoData({ type: "FeatureCollection", features });
    })();
  }, []);

  useEffect(() => {
    if (!geoData || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style:     "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center:    [-85.75, 38.25],
      zoom:      11,
    });
    mapRef.current = map;

    map.on("load", () => {
      map.addSource("facilities", { type: "geojson", data: geoData });
      map.addLayer({
        id:     "points",
        type:   "circle",
        source: "facilities",
        paint:  circlePaintStyles,
      });

      map.on("mousemove", "points", onHover);
      map.on("mouseleave", "points", hidePopup);
      map.on("click",      "points", onClick);
      map.on("mouseenter","points", () => map.getCanvas().style.cursor = "pointer");
      map.on("mouseleave","points", () => map.getCanvas().style.cursor = "");
    });

    return () => map.remove();
  }, [geoData]);

  function onHover(e) {
    if (!e.features.length) return hidePopup();
    const f = e.features[0];
    if (f.id === lastHoverId.current) return;
    lastHoverId.current = f.id;

    const p     = f.properties;
    const date  = p.date  ? new Date(p.date).toLocaleDateString() : "n/a";
    const score = p.score != null ? p.score : "n/a";
    const grade = p.grade || "";

    const html = /* html */`
      <div class="popup-content" style="font-size:14px;line-height:1.4;max-width:220px;">
        <strong style="font-size:16px;">${p.name}</strong><br/>
        <small style="opacity:0.8;">${p.address}</small><br/>
        <small style="opacity:0.8;">Inspected: ${date}</small><br/>
        Score: ${score}${grade ? ` (${grade})` : ""}
      </div>
    `;

    if (!popupRef.current) {
      popupRef.current = new maplibregl.Popup({
        anchor:       "bottom",
        offset:       [0, -14],
        closeButton:  false,
        closeOnMove:  false,
        closeOnClick: false,
      })
      .setLngLat(f.geometry.coordinates)
      .setHTML(html)
      .addTo(mapRef.current);
    } else {
      popupRef.current.setLngLat(f.geometry.coordinates).setHTML(html);
    }
  }

  function hidePopup() {
    clearTimeout(hideTimeout.current);
    hideTimeout.current = setTimeout(() => {
      popupRef.current?.remove();
      popupRef.current = null;
      lastHoverId.current = null;
    }, HIDE_DELAY);
  }

  function onClick(e) {
    const p     = e.features[0].properties;
    const date  = p.date  ? new Date(p.date).toLocaleDateString() : "n/a";
    const score = p.score != null ? p.score : "n/a";
    const grade = p.grade || "";

    setSelected({
      name:           p.name,
      address:        p.address,
      inspectionDate: date,
      score,
      grade,
    });

    mapRef.current.easeTo({
      center: e.features[0].geometry.coordinates,
      zoom:   14,
      duration: 600,
    });
  }

  return (
    <>
      <div ref={mapContainerRef} className="map-container" />

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
