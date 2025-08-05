import React, { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./Map.css";
import { getCircleColorExpression } from "./styleUtils";

const GEOJSON_URL =
  "https://services1.arcgis.com/79kfd2K6fskCAkyg/arcgis/rest/services/" +
  "louisville-metro-ky-restaurant-inspection-scores/FeatureServer/0/query?" +
  "where=1%3D1&outFields=*,InspectionDate&returnGeometry=true&f=geojson";
  
const isMobile = window.innerWidth <= 600;

const circlePaintStyles = {
  "circle-color": getCircleColorExpression(),
  "circle-radius": [
    "interpolate", ["linear"], ["zoom"],
      /* at zoom 8 */  8,  isMobile ? 4  : 6,
      /* at zoom 11 */ 11, isMobile ? 8  : 10.5,
      /* at zoom 14 */ 14, isMobile ? 12 : 14,
      /* at zoom 17 */ 17, isMobile ? 16 : 18
  ],
  "circle-opacity": 0.9,
  "circle-stroke-width": 2,
  "circle-stroke-color": "rgba(0,0,0,0.4)",
  "circle-blur": 0.25,
};

export default function Map() {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const popupRef = useRef(null);
  const hideTimeout = useRef();
  const pinnedRef = useRef(false);
  const HIDE_DELAY = 150;

  const [geoData, setGeoData] = useState(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const KEY = "geoDataCache";
    const TKEY = "geoDataCacheTime";
    const cache = localStorage.getItem(KEY);
    const ts = localStorage.getItem(TKEY);
    const now = Date.now();

    if (cache && ts && now - +ts < 1000 * 60 * 60 * 24 * 30) {
      setGeoData(JSON.parse(cache));
    } else {
      (async () => {
        const pageSize = 1000;
        let offset = 0;
        let allFeats = [];
        let lastJson;

        do {
          lastJson = await fetch(
            `${GEOJSON_URL}&resultOffset=${offset}&resultRecordCount=${pageSize}`
          ).then((r) => r.json());

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

  useEffect(() => {
    if (!geoData) return;
    const total = geoData.features.length;
    const missing = geoData.features.filter(
      (f) => f.properties.Score_Recent == null
    ).length;
    console.log(
      `Coverage: ${total - missing}/${total} (${(
        ((total - missing) / total) * 100
      ).toFixed(1)}%)`
    );
  }, [geoData]);

  useEffect(() => {
    if (mapInstanceRef.current || !geoData) return;

    const withIds = {
      ...geoData,
      features: geoData.features.map((f, i) => ({ ...f, id: i })),
    };

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style:
        "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: [-85.75, 38.25],
      zoom: 11,
    });
    mapInstanceRef.current = map;

    map.on("load", () => {
      map.addSource("restaurants", {
        type: "geojson",
        data: withIds,
        cluster: false,
      });
      map.addLayer({
        id: "points",
        type: "circle",
        source: "restaurants",
        paint: circlePaintStyles,
      });

      map.on("mousemove", onMapMouseMove);
      map.on("mouseleave", "points", scheduleHide);
      map.on("click", "points", onPointClick);
      map.on("mouseenter", "points", () =>
        (map.getCanvas().style.cursor = "pointer")
      );
      map.on("mouseleave", "points", () =>
        (map.getCanvas().style.cursor = "")
      );
    });

    function onMapMouseMove(e) {
      const hits = map.queryRenderedFeatures(e.point, {
        layers: ["points"],
      });
      if (hits.length) {
        const f = hits[0];
        const address = f.properties.premise_address || "No address";
        showOrUpdatePopup(f.properties, f.geometry.coordinates, address);
        clearTimeout(hideTimeout.current);
      } else {
        scheduleHide();
      }
    }

    function scheduleHide() {
      if (pinnedRef.current) return;
      clearTimeout(hideTimeout.current);
      hideTimeout.current = window.setTimeout(() => {
        popupRef.current?.remove();
        popupRef.current = null;
      }, HIDE_DELAY);
    }

    function showOrUpdatePopup(props, coords, address) {
      const name = props.premise_name || "Unnamed";
      const score = props.Score_Recent ?? "N/A";
      const grade = props.Grade_Recent || "";
      const html  = getPopupHTML(name, address, score, grade);

      if (!popupRef.current) {
        const popup = new maplibregl.Popup({
          anchor: "bottom",
          offset: [0, -14],
          closeButton: false,
          closeOnMove: false,
          closeOnClick: false,
          className: "dark-style-popup",
          focusAfterOpen: false,
        })
          .setHTML(html)
          .setLngLat(coords)
          .addTo(map);
        popupRef.current = popup;

        const el = popup.getElement();
        el.removeAttribute("tabindex");
        el.blur();

        const contentEl = el.querySelector(".popup-content");
        contentEl.style.caretColor = "transparent";
        contentEl.style.userSelect = "none";

        el.addEventListener("mouseenter", () =>
          clearTimeout(hideTimeout.current)
        );
        el.addEventListener("mouseleave", scheduleHide);

        el.addEventListener("click", () => {
          map.easeTo({
            center: coords,
            zoom: 13,
            duration: 800,
            easing: (t) => t * (2 - t),
          });
          setSelected({ name, address, score, grade });
        });
      } else {
        popupRef.current.setHTML(html).setLngLat(coords);
      }
    }
  }, [geoData]);

  function onPointClick(e) {
    const { properties: props, geometry } = e.features[0];
    const coords = geometry.coordinates;
    const name = props.premise_name || "Unnamed";
    const address = props.premise_address || "No address";
    const score = props.Score_Recent ?? "N/A";
    const grade = props.Grade_Recent || "";

    pinnedRef.current = true;
    mapInstanceRef.current.easeTo({
      center: coords,
      zoom: 14,
      duration: 800,
      easing: (t) => t * (2 - t),
    });
    mapInstanceRef.current.once("moveend", () =>
      popupRef.current?.setLngLat(coords).addTo(mapInstanceRef.current)
    );
    setSelected({ name, address, score, grade });
  }

  function getPopupHTML(name, address, score, grade) {
    return `
      <div class="popup-content" style="font-size:14px;line-height:1.4;max-width:200px;cursor:pointer">
        <strong style="font-size:16px;">${name}</strong><br/>
        <small style="opacity:0.8;">${address}</small><br/>  
        Score: ${score} ${grade ? `(${grade})` : ""}
      </div>
    `;
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
          <div className="info-drawer" onClick={(e) => e.stopPropagation()}>
            <button
              className="info-close"
              onClick={() => {
                pinnedRef.current = false;
                setSelected(null);
              }}
            >
              ×
            </button>
            <h2 className="info-title">{selected.name}</h2>
            <p className="info-address">{selected.address}</p>
            <p className="info-score">
              Score: {selected.score}
              {selected.grade && ` (${selected.grade})`}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
