// Every map popup: the hover popup, the pinned popup a click opens, the "1 of 3" popup
// for places sharing one spot, and the plain popup a Table View row opens.
import ReactDOM from "react-dom/client";
import maplibregl from "maplibre-gl";
import OverlapNav from "./OverlapNav.jsx";
import { formatDateSafe } from "../../lib/dates.js";
import { parseSimilarNearby } from "../../lib/inspectionHistory.js";
import { regionById } from "../../lib/regions.js";

const POPUP_OPTIONS = {
  anchor: "bottom",
  offset: [0, -14],
  closeButton: false,
  closeOnMove: false,
  closeOnClick: false,
};

// Names and addresses come from the city's data, so escape them before using them as HTML.
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

const scoreText = (p) => (p.score === 0 || p.score == null ? "N/A" : p.score);
const gradeText = (p) => (p.grade ? ` (${esc(p.grade)})` : "");
// Bullitt's routine inspections are undated when they come from the county's sheet; some
// are then estimated (lib/bullitt.js).
const dateText = (p) =>
  (p.date_text ?? formatDateSafe(p.date)) + (p.date_estimated ? " (estimated)" : "");
const canSave = (p) => regionById(p.region).has.saving;

const saveLabel = (saved) => (saved ? "Remove from watchlist" : "Save to watchlist");

// Styled in styles/Map.css (.popup-pin-btn): a finger-sized tap target around the icon,
// and no focus ring left on it after a tap.
function saveButtonHTML(eid, saved) {
  const label = saveLabel(saved);
  return `<button
    type="button"
    class="popup-pin-btn${saved ? " is-saved" : ""}"
    data-eid="${esc(eid)}"
    title="${label}"
    aria-label="${label}"
    aria-pressed="${saved}"
  ><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"
      fill="${saved ? "currentColor" : "none"}"
      stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
  </svg></button>`;
}

// Name, address, date, score, save button, "may also be listed as", and the
// "N locations here" badge when several places share the spot.
export function popupHTML(p, { saved = false, overlapCount = 0 } = {}) {
  const similar = parseSimilarNearby(p.similar_nearby);
  const aliasNote = similar.length
    ? `<div style="margin-top:5px;font-size:11px;color:rgba(255,255,255,0.45);border-top:1px solid rgba(255,255,255,0.08);padding-top:4px">⚠ May also be listed as: ${similar
        .map((n) => `<em>${esc(n.name)}</em>`)
        .join(", ")}</div>`
    : "";
  const overlap =
    overlapCount > 1
      ? `<div class="overlap-badge" aria-live="polite">${overlapCount} locations here</div>`
      : "";
  return `<div class="popup-content" style="font-size:14px;max-width:240px">
    <strong>${esc(p.name)}</strong><br/>
    <small>${esc(p.address_full || p.address)}</small><br/>
    <small>Inspected: ${esc(dateText(p))}</small><br/>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:1px">
      <span>Score: ${scoreText(p)}${gradeText(p)}</span>
      ${canSave(p) ? saveButtonHTML(p.establishment_id, saved) : ""}
    </div>
    ${aliasNote}
    ${overlap}
  </div>`;
}

// The simpler popup a Table View row opens: no save button, no click handlers.
function rowPopupHTML(p) {
  return `<div class="popup-content" style="font-size:14px;max-width:220px">
    <strong>${esc(p.name)}</strong><br/>
    <small>${esc(p.address_full || p.address)}</small><br/>
    Score: ${scoreText(p)}${gradeText(p)}
  </div>`;
}

function paintSaveButton(btn, saved) {
  const label = saveLabel(saved);
  btn.classList.toggle("is-saved", saved);
  btn.title = label;
  btn.setAttribute("aria-label", label);
  btn.setAttribute("aria-pressed", String(saved));
  btn.querySelector("svg")?.setAttribute("fill", saved ? "currentColor" : "none");
}

/**
 * Popup controller for one map. The pinned popup lives in `pinnedSlot` (a ref) because the
 * watch-area editor shares that slot, so only one dialog is open at a time.
 *   isSaved(eid), onToggleSaved(eid): the saved-places state
 *   onOpenDrawer(eid, props): clicking a popup opens the info drawer
 *   onGroupShow(feature): a "1 of 3" popup shows this place (opened, or stepped to)
 *   colorForScore(score): the popup's pointer takes the pin's colour
 */
export function createPopups({
  map,
  pinnedSlot,
  isSaved,
  onToggleSaved,
  onOpenDrawer,
  onGroupShow,
  colorForScore,
}) {
  let hover = null; // the hover popup
  let hoverId = null; // feature under the pointer, so moving within one pin doesn't redraw
  let navRoot = null; // React root for the "1 of 3" arrows
  let group = null; // { features, i } while a "1 of 3" popup is open

  // Moves an existing popup, or creates one the first time.
  const place = (popup, feature, html) =>
    popup
      ? popup.setLngLat(feature.geometry.coordinates).setHTML(html)
      : new maplibregl.Popup(POPUP_OPTIONS)
          .setLngLat(feature.geometry.coordinates)
          .setHTML(html)
          .addTo(map);

  const htmlFor = (feature, overlapCount) =>
    popupHTML(feature.properties, {
      saved: isSaved(feature.properties.establishment_id),
      overlapCount,
    });

  // Pointer colour, the save button, and clicking the popup to open the drawer.
  function wire(popup, feature) {
    const root = popup.getElement();
    const tip = root?.querySelector(".maplibregl-popup-tip");
    if (tip) tip.style.borderTopColor = colorForScore(feature.properties.score);

    const btn = root?.querySelector(".popup-pin-btn");
    if (btn) {
      // syncSaveButtons repaints it once the saved list changes
      btn.onclick = (ev) => {
        ev.stopPropagation();
        onToggleSaved(btn.dataset.eid);
      };
    }

    const content = root?.querySelector(".popup-content");
    if (content) {
      content.onclick = (ev) => {
        if (ev.target.closest(".popup-pin-btn")) return;
        ev.stopPropagation();
        onOpenDrawer(feature.properties.establishment_id, feature.properties);
      };
    }
  }

  function showPinned(feature) {
    pinnedSlot.current = place(pinnedSlot.current, feature, htmlFor(feature));
    wire(pinnedSlot.current, feature);
  }

  // features: everything at one spot, worst first. Arrows, the mouse wheel and the arrow
  // keys step through them.
  function showGroup(features, index) {
    if (!features?.length) return;
    const f = features[index];
    pinnedSlot.current = place(
      pinnedSlot.current,
      f,
      htmlFor(f, features.length) + `<div id="overlap-nav-root"></div>`,
    );
    group = { features, i: index };

    const el = pinnedSlot.current.getElement();
    el.tabIndex = 0;
    navRoot?.unmount();
    navRoot = ReactDOM.createRoot(el.querySelector("#overlap-nav-root"));
    navRoot.render(
      <OverlapNav
        index={index}
        total={features.length}
        onPrev={() => step(-1)}
        onNext={() => step(1)}
      />,
    );

    if (!el.dataset.navBound) {
      el.addEventListener(
        "wheel",
        (ev) => {
          ev.stopPropagation();
          step(ev.deltaY > 0 ? 1 : -1);
        },
        { passive: true },
      );
      el.addEventListener("keydown", (ev) => {
        if (ev.key !== "ArrowRight" && ev.key !== "ArrowLeft") return;
        ev.preventDefault();
        step(ev.key === "ArrowRight" ? 1 : -1);
      });
      el.dataset.navBound = "1";
    }
    el.focus({ preventScroll: true });
    wire(pinnedSlot.current, f);
    onGroupShow?.(f);
  }

  function step(direction) {
    if (!group) return;
    const n = group.features.length;
    showGroup(group.features, (group.i + direction + n) % n);
  }

  function showHover(feature, overlapCount) {
    hover = place(hover, feature, htmlFor(feature, overlapCount));
    wire(hover, feature);
  }

  function hideHover() {
    hover?.remove();
    hover = null;
    hoverId = null;
  }

  function clearPinned() {
    navRoot?.unmount();
    navRoot = null;
    pinnedSlot.current?.remove();
    pinnedSlot.current = null;
  }

  return {
    showPinned,
    showGroup,
    hideHover,
    clearPinned,
    clearAll() {
      clearPinned();
      hideHover();
    },

    // The pointer is over a pin (count: how many pins share that screen spot).
    pointerOver(feature, count) {
      if (feature.id === hoverId) return;
      hoverId = feature.id;
      showHover(feature, count);
    },

    // Opened from a list (What's New, the account page): replaces any open popup.
    openFor(feature) {
      clearPinned();
      hideHover();
      showPinned(feature);
    },

    // Hovering a list row shows the same popup as hovering the pin.
    hoverFor(feature) {
      showHover(feature, 1);
    },

    // A Table View row: the plain popup.
    showRow(feature) {
      clearPinned();
      pinnedSlot.current = new maplibregl.Popup(POPUP_OPTIONS)
        .setLngLat(feature.geometry.coordinates)
        .setHTML(rowPopupHTML(feature.properties))
        .addTo(map);
    },

    // A pin click closes the watch-area editor if it holds the shared slot.
    closeWatchEditor() {
      if (!pinnedSlot.current?.__watchArea) return;
      pinnedSlot.current.remove();
      pinnedSlot.current = null;
    },

    contains(target) {
      return [pinnedSlot.current, hover].some((p) => p?.getElement()?.contains(target));
    },

    // Repaints the save buttons of open popups after the saved list changes.
    syncSaveButtons() {
      for (const popup of [pinnedSlot.current, hover]) {
        const btn = popup?.getElement()?.querySelector(".popup-pin-btn");
        if (btn?.dataset.eid) paintSaveButton(btn, isSaved(btn.dataset.eid));
      }
    },
  };
}
