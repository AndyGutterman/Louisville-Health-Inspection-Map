// The pin control center's map: one county's outline and one marker, which the admin
// drags or moves with a click. Its own small MapLibre map (the site's map stays as it
// is underneath). The pasted "latitude, longitude" box in PlaceEditor is the way to
// place a pin without a pointer.
import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { BASEMAP } from "../map/useMapLibre.js";
import { outlineLayers, outlineSourceId } from "../../lib/regions.js";
import { MARKER_COLORS, regionBounds, regionOutlineUrl } from "../../lib/pinQueue.js";
import { useLatest } from "../../hooks/useLatest.js";

const PIN_ZOOM = 16;

/**
 * @param {{ region: string, point: { lon, lat, kind } | null, onPick: Function }} p
 *   onPick({ lon, lat }) when the admin clicks the map or lets go of the marker
 */
export default function PinMap({ region, point, onPick }) {
  const boxRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const onPickRef = useLatest(onPick);

  // The map, once.
  useEffect(() => {
    const map = new maplibregl.Map({
      container: boxRef.current,
      style: BASEMAP,
      bounds: regionBounds(region) ?? undefined,
      fitBoundsOptions: { padding: 20 },
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("click", (e) => onPickRef.current({ lon: e.lngLat.lng, lat: e.lngLat.lat }));
    mapRef.current = map;
    return () => {
      markerRef.current = null;
      mapRef.current = null;
      map.remove();
    };
    // Made once: the county and the pin follow in the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The county's outline, and the whole county in view when there is no pin to show.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const draw = () => {
      for (const layer of map.getStyle().layers) {
        if (layer.id.startsWith("region-")) map.removeLayer(layer.id);
      }
      for (const id of Object.keys(map.getStyle().sources)) {
        if (id.startsWith("region-")) map.removeSource(id);
      }
      map.addSource(outlineSourceId(region), { type: "geojson", data: regionOutlineUrl(region) });
      for (const layer of outlineLayers(region)) map.addLayer(layer);
    };
    if (map.isStyleLoaded()) draw();
    else map.once("load", draw);
  }, [region]);

  // The marker: where the point is, coloured by where it came from.
  const lon = point?.lon;
  const lat = point?.lat;
  const kind = point?.kind;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markerRef.current?.remove();
    markerRef.current = null;
    if (lon == null) {
      const b = regionBounds(region);
      if (b) map.fitBounds(b, { padding: 20, duration: 0 });
      return;
    }
    const marker = new maplibregl.Marker({
      draggable: true,
      color: MARKER_COLORS[kind] ?? MARKER_COLORS.new,
      opacity: kind === "outside" ? "0.6" : "1",
    })
      .setLngLat([lon, lat])
      .addTo(map);
    marker.on("dragend", () => {
      const at = marker.getLngLat();
      onPickRef.current({ lon: at.lng, lat: at.lat });
    });
    markerRef.current = marker;
    // A pin the admin just clicked or dragged stays where the map is; any other (a pasted
    // one, the place's own) is brought into view.
    if (kind !== "new") map.jumpTo({ center: [lon, lat], zoom: PIN_ZOOM });
  }, [lon, lat, kind, region, onPickRef]);

  return (
    <div
      ref={boxRef}
      className="pins-map"
      data-testid="pin-map"
      role="region"
      aria-label="Map of the county. Click to place the pin, or drag it."
    />
  );
}
