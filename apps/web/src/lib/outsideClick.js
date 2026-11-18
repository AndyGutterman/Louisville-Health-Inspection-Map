// Which clicks close the info drawer (and the map popups): any click outside the drawer
// and the panels that work beside it. features/map/useMapLibre.js listens for the clicks;
// the rule is here so it can be tested.

// A click inside one of these leaves the drawer open. A new floating panel or toggle
// either gets the data-map-overlay attribute or is added to this list.
export const KEEP_DRAWER_OPEN =
  "[data-map-overlay], .wa-handle, .control-card, .info-drawer, .acct-panel, .header-nav-btn--account, .table-panel, .table-toggle-btn, .pins-loading, .county-load";

// What's New also keeps the drawer open when a press only starts inside it (dragging its
// resize handle ends with the pointer somewhere else).
export const WHATS_NEW = ".wn-panel, .wn-trigger";

const within = (el, selector) => !!el?.closest?.(selector);

/**
 * True when a click should close the drawer and the popups.
 * @param {object} c
 * @param {Element} c.target        where the click ended
 * @param {Element|null} c.downTarget  where the press started, if known
 * @param {boolean} c.dragging      the map is being dragged
 * @param {boolean} c.inPopup       the click is inside a map popup
 */
export function closesDrawer({ target, downTarget = null, dragging = false, inPopup = false }) {
  if (dragging || inPopup) return false;
  if (within(target, WHATS_NEW) || within(downTarget, WHATS_NEW)) return false;
  return !within(target, KEEP_DRAWER_OPEN);
}
