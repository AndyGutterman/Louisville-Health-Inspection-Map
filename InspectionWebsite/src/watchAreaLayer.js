// Watch-area circles and their radius popup for MapLibre.

export const WATCH_RADIUS_OPTIONS = [1, 3, 5, 10, 25];

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Geodesic circle as a polygon, so the radius is accurate at Louisville's latitude.
export function buildCircle(area) {
  const radiusM = area.radius_miles * 1609.34;
  const latRad = (area.center_lat * Math.PI) / 180;
  const N = 96;
  const coords = [];
  for (let i = 0; i <= N; i++) {
    const angle = (i * 2 * Math.PI) / N;
    const dLon = (radiusM / (111320 * Math.cos(latRad))) * Math.sin(angle);
    const dLat = (radiusM / 110540) * Math.cos(angle);
    coords.push([area.center_lon + dLon, area.center_lat + dLat]);
  }
  return {
    type: "Feature",
    properties: { id: area.id, label: area.label || area.center_address || `${area.radius_miles} mi` },
    geometry: { type: "Polygon", coordinates: [coords] },
  };
}

export function buildWatchCollection(areas) {
  return {
    type: "FeatureCollection",
    features: areas
      .filter((a) => typeof a.center_lat === "number" && typeof a.center_lon === "number")
      .map(buildCircle),
  };
}

const POPUP_CSS = `
.wa-popup .maplibregl-popup-content {
  background: rgba(20,20,24,0.98); color: #f0f0f3; font-family: inherit;
  border: 1px solid rgba(255,255,255,0.12); border-radius: 14px;
  padding: 14px 14px 12px; box-shadow: 0 14px 40px rgba(0,0,0,0.6);
  width: 240px; box-sizing: border-box;
}
.wa-popup .maplibregl-popup-tip { border-top-color: rgba(20,20,24,0.98); }
.wa-popup .maplibregl-popup-close-button { color: rgba(255,255,255,0.55); font-size: 18px; padding: 2px 8px; }
.wa-popup .maplibregl-popup-close-button:hover { background: transparent; color: #fff; }
.wa-title { font-size: 13px; font-weight: 700; line-height: 1.3; padding-right: 20px; overflow-wrap: anywhere; }
.wa-label { font-size: 10px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: rgba(255,255,255,0.42); margin: 12px 0 6px; }
.wa-seg { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; }
.wa-seg button {
  height: 40px; padding: 0; border-radius: 8px; cursor: pointer; font-family: inherit;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12); color: rgba(255,255,255,0.78);
}
.wa-seg button b { font-size: 13px; font-weight: 700; line-height: 1; }
.wa-seg button small { font-size: 9px; font-weight: 700; line-height: 1; opacity: .55; }
.wa-seg button:hover:not(.on) { border-color: rgba(255,159,28,0.45); color: #fff; }
.wa-seg button.on { background: #ff9f1c; border-color: #ff9f1c; color: #15151a; }
.wa-seg button.on small { opacity: .7; }
.wa-seg button:focus-visible { outline: 2px solid #ffb347; outline-offset: 2px; }
@media (max-width: 560px) {
  .wa-popup .maplibregl-popup-content { width: min(240px, calc(100vw - 48px)); }
  .wa-seg button { height: 44px; }
}
`;

function ensureStyles() {
  if (document.getElementById("wa-popup-styles")) return;
  const el = document.createElement("style");
  el.id = "wa-popup-styles";
  el.textContent = POPUP_CSS;
  document.head.appendChild(el);
}

// Opens the radius picker in the shared popup slot (popupRef), so only one dialog is open at a time.
export function openWatchPopup({ maplibregl, map, popupRef, area, lngLat, onRadius }) {
  popupRef.current?.remove();
  ensureStyles();

  const current = area.radius_miles;
  const html = `
    <div>
      <div class="wa-title">${esc(area.label || area.center_address || "Watch area")}</div>
      <div class="wa-label">Radius</div>
      <div class="wa-seg">
        ${WATCH_RADIUS_OPTIONS.map((r) =>
          `<button type="button" data-wa-radius="${r}" class="${r === current ? "on" : ""}" aria-pressed="${r === current}">
             <b>${r}</b><small>mi</small>
           </button>`).join("")}
      </div>
    </div>`;

  const popup = new maplibregl.Popup({
    anchor: "bottom",
    offset: 12,
    closeButton: true,
    closeOnClick: true,
    closeOnMove: false,
    maxWidth: "none",
    className: "wa-popup",
  })
    .setLngLat(lngLat)
    .setHTML(html)
    .addTo(map);

  popup.__watchArea = true; // lets pin clicks clear this popup before opening their own
  popupRef.current = popup;
  popup.on("close", () => {
    if (popupRef.current === popup) popupRef.current = null;
  });

  popup.getElement()?.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("[data-wa-radius]");
    if (!btn) return;
    await onRadius(Number(btn.dataset.waRadius));
    popup.remove();
  });
}