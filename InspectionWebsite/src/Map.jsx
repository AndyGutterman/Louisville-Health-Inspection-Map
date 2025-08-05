import React, { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./Map.css";
import { getCircleColorExpression } from "./styleUtils";

// GeoJSON for geometry & permit lookup
const GEOJSON_URL =
  "https://services1.arcgis.com/79kfd2K6fskCAkyg/ArcGIS/rest/services/" +
  "FoodMapping/FeatureServer/0/query?" +
  "where=1%3D1&outFields=permit_number,premise_name,premise_address&returnGeometry=true&f=geojson";

// Table of inspections (paged)
const SCORE_TABLE_URL_BASE =
  "https://services1.arcgis.com/79kfd2K6fskCAkyg/ArcGIS/rest/services/" +
  "FoodServiceData/FeatureServer/0/query?";

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
  "circle-opacity": 0.9,
  "circle-stroke-width": 2,
  "circle-stroke-color": "rgba(0,0,0,0.4)",
  "circle-blur": 0.25,
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

  function normId(v) {
    if (v === null || v === undefined) return null;
    const s = String(v).replace(/,/g, "").trim();
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? String(n) : null;
  }

  function normText(s) {
    if (!s) return "";
    return String(s).toUpperCase().replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function pickLatestWithNonZeroFirst(list) {
    if (!list || list.length === 0) return { InspectionDate: null, score: null, Grade: "" };
    const non0 = list.filter(r => (r.score ?? 0) > 0);
    const pool = non0.length ? non0 : list;
    return pool.reduce((a, b) =>
      new Date(b.InspectionDate) > new Date(a.InspectionDate) ? b : a
    );
  }

  useEffect(() => {
    (async () => {
      const geoJson = await fetch(GEOJSON_URL).then(r => r.json());

      let offset = 0, all = [], page;
      do {
        const params = new URLSearchParams({
          where:             "1=1",
          outFields:         "EstablishmentID,EstablishmentName,Address,InspectionDate,score,Grade",
          orderByFields:     "InspectionDate DESC",
          resultRecordCount: "1000",
          resultOffset:      String(offset),
          returnGeometry:    "false",
          f:                 "json",
        });
        page = await fetch(SCORE_TABLE_URL_BASE + params).then(r => r.json());
        if (page.features) {
          for (const f of page.features) all.push(f.attributes);
        }
        offset += 1000;
      } while (page.features && page.features.length === 1000);

      const byId = {};
      const byNameAddr = {};
      for (const r of all) {
        const idKey = normId(r.EstablishmentID);
        if (idKey) (byId[idKey] = byId[idKey] || []).push(r);

        const nameKey = normText(r.EstablishmentName);
        const addrKey = normText(r.Address);
        const naKey = nameKey + "|" + addrKey;
        (byNameAddr[naKey] = byNameAddr[naKey] || []).push(r);
      }

      const enriched = {
        ...geoJson,
        features: geoJson.features.map((f, idx) => {
          const idKey   = normId(f.properties.permit_number);
          const nameKey = normText(f.properties.premise_name);
          const addrKey = normText(f.properties.premise_address);

          let recs = (idKey && byId[idKey]) || byNameAddr[nameKey + "|" + addrKey] || [];
          const best = pickLatestWithNonZeroFirst(recs);

          return {
            ...f,
            id: idx,
            properties: {
              ...f.properties,
              score: best.score,
              date:  best.InspectionDate,
              grade: best.Grade,
            }
          };
        })
      };

      setGeoData(enriched);
    })().catch(console.error);
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
      map.addSource("inspections", { type: "geojson", data: geoData });
      map.addLayer({
        id:     "points",
        type:   "circle",
        source: "inspections",
        paint:  circlePaintStyles,
      });

      map.on("mousemove",  "points", onHover);
      map.on("mouseleave", "points", hidePopup);
      map.on("click",      "points", onClick);
      map.on("mouseenter","points", () => map.getCanvas().style.cursor = "pointer");
      map.on("mouseleave","points", () => map.getCanvas().style.cursor = "");
    });

    function onHover(e) {
      if (!e.features.length) return hidePopup();
      const f = e.features[0];
      if (f.id === lastHoverId.current) return;
      lastHoverId.current = f.id;

      const p = f.properties;
      const date  = p.date  ? new Date(p.date).toLocaleDateString() : "n/a";
      const score = (p.score ?? null) === null ? "n/a" : p.score;
      const grade = p.grade || "";

      showPopup(
        f.geometry.coordinates,
        p.premise_name || "Unnamed",
        p.premise_address || "No address",
        date,
        score,
        grade
      );
    }

    function showPopup(coords, name, address, date, score, grade) {
      clearTimeout(hideTimeout.current);
      const html = `
        <div class="popup-content" style="font-size:14px;line-height:1.4;max-width:220px;cursor:pointer">
          <strong style="font-size:16px;">${name}</strong><br/>
          <small style="opacity:0.8;">${address}</small><br/>
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
          .setLngLat(coords)
          .setHTML(html)
          .addTo(mapRef.current);
      } else {
        popupRef.current.setLngLat(coords).setHTML(html);
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
      const p = e.features[0].properties;
      const date  = p.date  ? new Date(p.date).toLocaleDateString() : "n/a";
      const score = (p.score ?? null) === null ? "n/a" : p.score;
      const grade = p.grade || "";

      setSelected({
        name:           p.premise_name || "Unnamed",
        address:        p.premise_address || "No address",
        inspectionDate: date,
        score,
        grade,
      });
    }

    return () => map.remove();
  }, [geoData]);

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
