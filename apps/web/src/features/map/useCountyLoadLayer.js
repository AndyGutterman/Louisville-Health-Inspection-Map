// Counties that are switched off (lib/counties.js) are shaded with orange stripes inside
// their outline, with a button in the middle: tapping either switches the county on,
// which loads its pins. A county that is loading keeps its stripes and says so; one that
// is on has neither. Every county gets the same treatment.
import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "../../styles/CountyLoad.css";
import { useLatest } from "../../hooks/useLatest.js";
import { countyStatusText } from "../../lib/counties.js";
import { outlineSourceId } from "../../lib/regions.js";
import { CLICKABLE_LAYERS } from "./mapLayers.js";

const STRIPES = "county-stripes";
const stripeLayerId = (regionId) => `${outlineSourceId(regionId)}-stripes`;

// A 32px tile of diagonal orange stripes (the same orange as the category tiles), as raw
// pixels: MapLibre repeats it across the county. 32 is a multiple of the 16px stripe
// period, so the tiles join without a seam.
function stripeImage(size = 32, period = 16, band = 6) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const on = (x + y) % period < band;
      data.set([255, 159, 28, on ? 150 : 26], (y * size + x) * 4);
    }
  }
  return { width: size, height: size, data };
}

// The button's words: "Bullitt County" over "Tap to load", "Loading…" and so on.
function buttonLabel(county) {
  if (county.state === "ready") return "Tap to show";
  if (!county.state) return "Tap to load";
  return countyStatusText(county);
}

/**
 * @param {object} o
 * @param {React.RefObject} o.mapRef
 * @param {boolean} o.mapReady      true once the pin layers and county outlines exist
 * @param {object[]} o.counties     { id, name, labelAt, shown, state } per county
 * @param {Function} o.onShowCounty (id) switch a county on
 */
export function useCountyLoadLayer(o) {
  const { mapRef, mapReady, counties } = o;
  const latest = useLatest(o);
  const markers = useRef({}); // county id -> { marker, button, label }

  // Once: the stripe layers (hidden until the effect below shows them) and their clicks.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return undefined;
    if (!map.hasImage(STRIPES)) map.addImage(STRIPES, stripeImage(), { pixelRatio: 2 });
    // Under every county's outline (the first outline layer added is the lowest).
    const lowest = `${outlineSourceId(latest.current.counties[0]?.id)}-glow`;
    const below = map.getLayer(lowest) ? lowest : undefined;
    const added = [];
    for (const county of latest.current.counties) {
      const id = stripeLayerId(county.id);
      if (map.getLayer(id) || !map.getSource(outlineSourceId(county.id))) continue;
      map.addLayer(
        {
          id,
          type: "fill",
          source: outlineSourceId(county.id),
          layout: { visibility: "none" },
          paint: { "fill-pattern": STRIPES, "fill-opacity": 0.55 },
        },
        below,
      );
      const onClick = (e) => {
        // A pin drawn over the stripes (a neighbouring county's) keeps its own click.
        if (map.queryRenderedFeatures(e.point, { layers: CLICKABLE_LAYERS }).length) return;
        latest.current.onShowCounty(county.id);
      };
      const onEnter = () => (map.getCanvas().style.cursor = "pointer");
      const onLeave = () => (map.getCanvas().style.cursor = "");
      map.on("click", id, onClick);
      map.on("mouseenter", id, onEnter);
      map.on("mouseleave", id, onLeave);
      added.push(() => {
        map.off("click", id, onClick);
        map.off("mouseenter", id, onEnter);
        map.off("mouseleave", id, onLeave);
      });
    }
    return () => added.forEach((off) => off());
  }, [mapRef, mapReady, latest]);

  // Stripes and buttons follow which counties are on, and what each is doing.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    for (const county of counties) {
      const striped = !county.shown || county.state === "loading" || county.state === "failed";
      const layer = stripeLayerId(county.id);
      if (map.getLayer(layer)) {
        map.setLayoutProperty(layer, "visibility", striped ? "visible" : "none");
      }

      let m = markers.current[county.id];
      if (!striped) {
        m?.marker.remove();
        delete markers.current[county.id];
        continue;
      }
      if (!m) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "county-load";
        button.dataset.testid = `county-load-${county.id}`;
        const name = document.createElement("span");
        name.className = "county-load-name";
        name.textContent = county.name;
        const label = document.createElement("span");
        label.className = "county-load-status";
        button.append(name, label);
        button.addEventListener("click", (ev) => {
          ev.stopPropagation();
          latest.current.onShowCounty(county.id);
        });
        const marker = new maplibregl.Marker({ element: button, anchor: "center" })
          .setLngLat(county.labelAt)
          .addTo(map);
        m = markers.current[county.id] = { marker, button, label };
      }
      m.label.textContent = buttonLabel(county);
      m.button.dataset.state = county.state ?? "idle";
      m.button.disabled = county.state === "loading";
      m.button.setAttribute("aria-label", `${county.name}: ${buttonLabel(county)}`);
    }
  }, [mapRef, mapReady, counties, latest]);

  // Buttons go with the map.
  useEffect(
    () => () => {
      for (const m of Object.values(markers.current)) m.marker.remove();
      markers.current = {};
    },
    [],
  );
}
