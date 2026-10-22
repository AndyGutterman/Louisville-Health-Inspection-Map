// Watch-area circles and their editor (popup + drag handles) for MapLibre.

export const WATCH_RADIUS_OPTIONS = [1, 3, 5, 10];
export const WATCH_MIN_MILES = 1;
export const WATCH_MAX_MILES = 10;

const MILE_M = 1609.34;

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Geodesic circle as a polygon, so the radius is accurate at Louisville's latitude.
export function buildCircle(area) {
  const radiusM = area.radius_miles * MILE_M;
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

// ── Geometry helpers ─────────────────────────────────────────────────────────

// Point on the circle's east edge, where the resize handle sits.
function eastEdge({ center_lat, center_lon, radius_miles }) {
  const latRad = (center_lat * Math.PI) / 180;
  return [center_lon + (radius_miles * MILE_M) / (111320 * Math.cos(latRad)), center_lat];
}

function distanceMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const clampMiles = (m) => Math.max(WATCH_MIN_MILES, Math.min(WATCH_MAX_MILES, Math.round(m)));

// ── Styles (match the control card, tabs and info panels) ────────────────────

const POPUP_CSS = `
@keyframes wa-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }

.wa-popup .maplibregl-popup-content {
  background: rgba(18,18,22,.94);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255,255,255,.09);
  border-radius: 16px;
  box-shadow: 0 14px 26px rgba(0,0,0,.35);
  color: #fff; font-family: inherit;
  padding: 12px 12px 10px; width: 236px; box-sizing: border-box;
  user-select: none; -webkit-user-select: none;
  animation: wa-in .14s ease-out;
}
.wa-popup .maplibregl-popup-tip { border-top-color: rgba(18,18,22,.94); }
.wa-popup .maplibregl-popup-close-button {
  top: 8px; right: 8px; width: 24px; height: 24px; padding: 0;
  border-radius: 50%; font-size: 16px; line-height: 24px;
  color: rgba(255,255,255,.45); transition: background .12s, color .12s;
}
.wa-popup .maplibregl-popup-close-button:hover { background: rgba(255,255,255,.09); color: #fff; }

.wa-head { display: flex; align-items: center; gap: 10px; padding-right: 26px; }
.wa-titles { flex: 1; min-width: 0; }
.wa-title { font-size: .96rem; font-weight: 700; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wa-sub { font-size: .72rem; line-height: 1.3; color: rgba(255,255,255,.42); margin-top: 1px; overflow-wrap: anywhere; }
.wa-value { flex-shrink: 0; font-size: .82rem; font-weight: 800; color: #ff9f1c; font-variant-numeric: tabular-nums; }

.wa-seg {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 3px; padding: 4px; margin-top: 10px;
  background: rgba(0,0,0,.20); border: 1px solid rgba(255,255,255,.07); border-radius: 10px;
}
.wa-seg button {
  all: unset; box-sizing: border-box; text-align: center; cursor: pointer;
  padding: 8px 0; border-radius: 7px;
  font-size: .76rem; font-weight: 800; letter-spacing: .03em;
  color: rgba(255,255,255,.38); transition: color .12s, background .12s;
}
.wa-seg button:hover:not(.on) { color: rgba(255,255,255,.65); }
.wa-seg button.on { background: rgba(255,255,255,.10); color: #fff; }
.wa-seg button:focus-visible { outline: 2px solid rgba(255,255,255,.30); outline-offset: 1px; }

/* Drag handles. The outer element is the marker (MapLibre positions it with a
   transform, so never set transform on it); the inner dot is what we style. */
.wa-handle { width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; cursor: grab; touch-action: none; }
.wa-handle:active { cursor: grabbing; }
.wa-dot {
  width: 32px; height: 32px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: rgba(18,18,22,.94); border: 2px solid #ff9f1c; color: #ff9f1c;
  box-shadow: 0 4px 14px rgba(0,0,0,.5);
  transition: transform .1s, background .1s;
}
.wa-handle:hover .wa-dot, .wa-handle:active .wa-dot { transform: scale(1.1); background: #ff9f1c; color: #15151a; }
.wa-handle-size .wa-dot { width: 28px; height: 28px; }

@media (max-width: 560px) {
  .wa-popup .maplibregl-popup-content { width: min(236px, calc(100vw - 48px)); }
  .wa-seg button { padding: 11px 0; }
}
@media (prefers-reduced-motion: reduce) {
  .wa-popup .maplibregl-popup-content { animation: none; }
  .wa-dot { transition: none; }
}
`;

function ensureStyles() {
  if (document.getElementById("wa-popup-styles")) return;
  const el = document.createElement("style");
  el.id = "wa-popup-styles";
  el.textContent = POPUP_CSS;
  document.head.appendChild(el);
}

const ICON_MOVE =
  '<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>';
const ICON_SIZE = '<path d="M4 12h16M4 12l4-4M4 12l4 4M20 12l-4-4M20 12l-4 4"/>';

function makeHandle(kind, label, iconPath) {
  const el = document.createElement("div");
  el.className = `wa-handle wa-handle-${kind}`;
  el.setAttribute("role", "button");
  el.setAttribute("aria-label", label);
  el.title = label;
  el.innerHTML = `<span class="wa-dot">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPath}</svg>
  </span>`;
  // A tap on a handle must never count as a tap on the map underneath.
  el.addEventListener("click", (e) => e.stopPropagation());
  return el;
}

// ── Editor ───────────────────────────────────────────────────────────────────
// Opens the radius popup plus two drag handles: one at the center (move) and
// one on the east edge (resize). Everything lives and dies with the popup, so
// only one dialog is open at a time (popupRef is the shared popup slot).
//
//   getAreas()   returns the current list of watch areas (for live preview)
//   onCommit(p)  is called after each change with { center_lat, center_lon, radius_miles }
export function openWatchEditor({ maplibregl, map, popupRef, area, getAreas, onCommit }) {
  popupRef.current?.remove();
  ensureStyles();

  const draft = {
    center_lat: area.center_lat,
    center_lon: area.center_lon,
    radius_miles: area.radius_miles,
  };

  const name = area.label || area.center_address || "Watch area";
  const sub = area.label && area.center_address && area.label !== area.center_address ? area.center_address : "";

  const root = document.createElement("div");
  root.innerHTML = `
    <div class="wa-head">
      <div class="wa-titles">
        <div class="wa-title" title="${esc(name)}">${esc(name)}</div>
        ${sub ? `<div class="wa-sub">${esc(sub)}</div>` : ""}
      </div>
      <div class="wa-value"></div>
    </div>
    <div class="wa-seg" role="radiogroup" aria-label="Watch radius in miles">
      ${WATCH_RADIUS_OPTIONS.map((r) =>
        `<button type="button" role="radio" data-wa-radius="${r}">${r} mi</button>`).join("")}
    </div>`;

  const valueEl = root.querySelector(".wa-value");
  const buttons = [...root.querySelectorAll("[data-wa-radius]")];

  const updateUI = () => {
    valueEl.textContent = `${draft.radius_miles} mi`;
    for (const b of buttons) {
      const on = Number(b.dataset.waRadius) === draft.radius_miles;
      b.classList.toggle("on", on);
      b.setAttribute("aria-checked", String(on));
    }
  };

  // Redraw the circle immediately, without waiting for the save round-trip.
  const preview = () => {
    const src = map.getSource("watch-areas");
    if (!src) return;
    src.setData(
      buildWatchCollection(getAreas().map((a) => (a.id === area.id ? { ...a, ...draft } : a))),
    );
  };

  const commit = () => onCommit?.({ ...draft });

  // Handles
  const moveEl = makeHandle("move", "Drag to move this area", ICON_MOVE);
  const sizeEl = makeHandle("size", "Drag to resize this area", ICON_SIZE);

  const moveMarker = new maplibregl.Marker({ element: moveEl, draggable: true })
    .setLngLat([draft.center_lon, draft.center_lat])
    .addTo(map);
  const sizeMarker = new maplibregl.Marker({ element: sizeEl, draggable: true })
    .setLngLat(eastEdge(draft))
    .addTo(map);

  const popup = new maplibregl.Popup({
    anchor: "bottom",
    offset: [0, -24],
    closeButton: true,
    closeOnClick: false, // map clicks are handled in Map.jsx, so a tap inside the popup can't close it
    closeOnMove: false,
    maxWidth: "none",
    className: "wa-popup",
  })
    .setLngLat([draft.center_lon, draft.center_lat])
    .setDOMContent(root)
    .addTo(map);

  popup.__watchArea = true; // lets pin clicks clear this popup before opening their own
  popupRef.current = popup;

  popup.on("close", () => {
    moveMarker.remove();
    sizeMarker.remove();
    if (popupRef.current === popup) popupRef.current = null;
  });

  // Move: the circle, the resize handle and the popup follow the center handle.
  moveMarker.on("drag", () => {
    const ll = moveMarker.getLngLat();
    draft.center_lat = ll.lat;
    draft.center_lon = ll.lng;
    sizeMarker.setLngLat(eastEdge(draft));
    popup.setLngLat(ll);
    preview();
  });
  moveMarker.on("dragend", commit);

  // Resize: radius is the distance from the center to the handle, in whole miles.
  sizeMarker.on("drag", () => {
    const ll = sizeMarker.getLngLat();
    draft.radius_miles = clampMiles(distanceMiles(draft.center_lat, draft.center_lon, ll.lat, ll.lng));
    updateUI();
    preview();
  });
  sizeMarker.on("dragend", () => {
    sizeMarker.setLngLat(eastEdge(draft)); // snap the handle back onto the edge
    commit();
  });

  // Presets. The popup stays open so you can keep adjusting.
  root.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-wa-radius]");
    if (!btn) return;
    draft.radius_miles = Number(btn.dataset.waRadius);
    updateUI();
    sizeMarker.setLngLat(eastEdge(draft));
    preview();
    commit();
  });

  updateUI();
}

// Kept so older imports don't break.
export const openWatchPopup = openWatchEditor;