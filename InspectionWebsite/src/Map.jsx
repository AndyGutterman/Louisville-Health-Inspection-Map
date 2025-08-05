import React, { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./Map.css";
import { getCircleColorExpression } from "./styleUtils";

// Primary GeoJSON source for rendering bubbles on the map.
// Comes from FoodMapping service and provides geometry, Score_Recent, Grade_Recent, premise_name, premise_address, permit_number, etc
const GEOJSON_URL =
  "https://services1.arcgis.com/79kfd2K6fskCAkyg/arcgis/rest/services/" +
  "FoodMapping/FeatureServer/0/query?" +
  "where=1%3D1&outFields=*&returnGeometry=true&f=geojson";

// Secondary service used to look up the inspection date.
// FoodServiceData layer which contains EstablishmentID & InspectionDate
const SCORE_DATE_URL_BASE =
  "https://services1.arcgis.com/79kfd2K6fskCAkyg/ArcGIS/rest/services/" +
  "FoodServiceData/FeatureServer/0/query?";

const isMobile = window.innerWidth <= 600;
const circlePaintStyles = {
  "circle-color": getCircleColorExpression(),
  "circle-radius": [
    "interpolate", ["linear"], ["zoom"],
      8,  isMobile ? 4  : 6,
     11,  isMobile ? 8  : 10.5,
     14,  isMobile ? 12 : 14,
     17,  isMobile ? 16 : 18
  ],
  "circle-opacity": 0.9,
  "circle-stroke-width": 2,
  "circle-stroke-color": "rgba(0,0,0,0.4)",
  "circle-blur": 0.25,
};

export default function Map() {
  const mapContainerRef = useRef(null);
  const mapInstanceRef  = useRef(null);
  const popupRef        = useRef(null);
  const hideTimeout     = useRef();
  const pinnedRef       = useRef(false);
  const HIDE_DELAY      = 150;

  const [geoData, setGeoData]   = useState(null);
  const [selected, setSelected] = useState(null);

  // load & cache FoodMapping GeoJSON
  useEffect(() => {
    const KEY  = "geoDataCache";
    const TKEY = "geoDataCacheTime";
    const cache = localStorage.getItem(KEY);
    const ts    = localStorage.getItem(TKEY);
    const now   = Date.now();

    if (cache && ts && now - +ts < 1000 * 60 * 60 * 24 * 30) {
      setGeoData(JSON.parse(cache));
    } else {
      (async () => {
        const pageSize = 1000;
        let offset = 0, allFeats = [], lastJson;
        do {
          lastJson = await fetch(
            `${GEOJSON_URL}&resultOffset=${offset}&resultRecordCount=${pageSize}`
          ).then(r => r.json());
          allFeats = allFeats.concat(lastJson.features);
          offset += pageSize;
        } while (lastJson.features.length === pageSize);

        const fullGeo = { ...lastJson, features: allFeats };
        setGeoData(fullGeo);
        localStorage.setItem(KEY, JSON.stringify(fullGeo));
        localStorage.setItem(TKEY, now.toString());
      })().catch(console.error);
    }
  }, []);

  // coverage log
  useEffect(() => {
    if (!geoData) return;
    const total   = geoData.features.length;
    const missing = geoData.features.filter(f => f.properties.Score_Recent == null).length;
    console.log(
      `Coverage: ${total - missing}/${total} (${(((total - missing)/total)*100).toFixed(1)}%)`
    );
  }, [geoData]);

  // init map & hover popup
  useEffect(() => {
    if (mapInstanceRef.current || !geoData) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style:    "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center:   [-85.75, 38.25],
      zoom:     11,
    });
    mapInstanceRef.current = map;

    const withIds = {
      ...geoData,
      features: geoData.features.map((f, i) => ({ ...f, id: i })),
    };

    map.on("load", () => {
      map.addSource("restaurants", { type: "geojson", data: withIds, cluster: false });
      map.addLayer({
        id:    "points",
        type:  "circle",
        source:"restaurants",
        paint: circlePaintStyles
      });

      map.on("mousemove", onMapMouseMove);
      map.on("mouseleave","points", scheduleHide);
      map.on("click",    "points", onPointClick);
      map.on("mouseenter","points", () => map.getCanvas().style.cursor = "pointer");
      map.on("mouseleave","points", () => map.getCanvas().style.cursor = "");
    });

    function onMapMouseMove(e) {
      const hits = map.queryRenderedFeatures(e.point, { layers: ["points"] });
      if (!hits.length) { scheduleHide(); return; }

      const f       = hits[0];
      const name    = f.properties.premise_name    || "Unnamed";
      const address = f.properties.premise_address || "No address";
      const score   = f.properties.Score_Recent    ?? "N/A";
      const grade   = f.properties.Grade_Recent    || "";

      const html = `
        <div class="popup-content" style="font-size:14px;line-height:1.4;max-width:200px;cursor:pointer">
          <strong style="font-size:16px;">${name}</strong><br/>
          <small style="opacity:0.8;">${address}</small><br/>
          Score: ${score} ${grade ? `(${grade})` : ""}
        </div>
      `;

      if (!popupRef.current) {
        popupRef.current = new maplibregl.Popup({
          anchor:       "bottom",
          offset:       [0, -14],
          closeButton:  false,
          closeOnMove:  false,
          closeOnClick: false,
          className:    "dark-style-popup",
          focusAfterOpen: false,
        })
          .setHTML(html)
          .setLngLat(f.geometry.coordinates)
          .addTo(map);

        const el        = popupRef.current.getElement();
        const contentEl = el.querySelector(".popup-content");
        el.removeAttribute("tabindex");
        el.blur();
        contentEl.style.caretColor = "transparent";
        contentEl.style.userSelect  = "none";

        el.addEventListener("mouseenter", () => clearTimeout(hideTimeout.current));
        el.addEventListener("mouseleave", scheduleHide);
      } else {
        popupRef.current
          .setHTML(html)
          .setLngLat(f.geometry.coordinates);
      }

      clearTimeout(hideTimeout.current);
    }

    function scheduleHide() {
      if (pinnedRef.current) return;
      clearTimeout(hideTimeout.current);
      hideTimeout.current = setTimeout(() => {
        popupRef.current?.remove();
        popupRef.current = null;
      }, HIDE_DELAY);
    }
  }, [geoData]);

  // click handler also fetches the latest InspectionDate
  function onPointClick(e) {
    const { properties: props, geometry } = e.features[0];
    const coords    = geometry.coordinates;
    const name      = props.premise_name    || "Unnamed";
    const address   = props.premise_address || "No address";
    const score     = props.Score_Recent    ?? "N/A";
    const grade     = props.Grade_Recent    || "";
    const permitNum = props.permit_number;

    pinnedRef.current = true;
    mapInstanceRef.current.easeTo({
      center:   coords,
      zoom:     14,
      duration: 800,
      easing:   t => t*(2-t),
    });
    mapInstanceRef.current.once("moveend", () =>
      popupRef.current?.setLngLat(coords).addTo(mapInstanceRef.current)
    );

    // show loading…
    setSelected({ name, address, score, grade, inspectionDate: "Loading…" });

    // query that matches EstablishmentID = permit_number,
    // returns the newest InspectionDate
    const params = new URLSearchParams({
      where:             `EstablishmentID=${permitNum} AND Score=${score}`, // <-- use EstablishmentID matched with score
      outFields:         "InspectionDate",
      orderByFields:     "InspectionDate DESC",
      resultRecordCount: "1",
      returnGeometry:    "false",
      f:                 "json",
    });

    fetch(SCORE_DATE_URL_BASE + params.toString())
      .then(r => r.json())
      .then(json => {
        console.log("InspectionDate response:", json);
        const ms    = json.features?.[0]?.attributes?.InspectionDate;
        const human = ms ? new Date(ms).toLocaleDateString() : "n/a";
        setSelected(s => ({ ...s, inspectionDate: human }));
      })
      .catch(err => {
        console.error("Date fetch error:", err);
        setSelected(s => ({ ...s, inspectionDate: "Error" }));
      });
  }

  return (
    <>
      <div ref={mapContainerRef} className="map-container" />

      {selected && (
        <div
          className="info-overlay"
          onClick={() => {
            pinnedRef.current = false;
            setSelected(null);
          }}
        >
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
