import { describe, expect, it } from "vitest";
import { KEEP_DRAWER_OPEN, closesDrawer } from "./outsideClick.js";

// A stand-in for a DOM element (the tests run without a browser): `path` is the element
// and its ancestors, innermost first, each a class name or "[attribute]". closest()
// understands the comma-separated simple selectors the rule uses.
function el(...path) {
  return {
    closest: (selector) =>
      selector
        .split(",")
        .map((s) => s.trim())
        .some((s) => path.includes(s))
        ? {}
        : null,
  };
}

const MAP = el(".maplibregl-canvas", ".map-container");

describe("closesDrawer", () => {
  it("closes on a click on the map or the page behind the panels", () => {
    expect(closesDrawer({ target: MAP })).toBe(true);
    expect(closesDrawer({ target: el(".app-header") })).toBe(true);
  });

  it("stays open for a click inside the drawer or a panel that works beside it", () => {
    for (const panel of [
      ".info-drawer",
      ".control-card",
      ".acct-panel",
      ".header-nav-btn--account",
      ".table-panel",
      ".table-toggle-btn",
      ".pins-loading",
      ".county-load",
      ".wa-handle",
    ]) {
      expect(closesDrawer({ target: el(".some-button", panel) }), panel).toBe(false);
    }
  });

  it("stays open for anything marked data-map-overlay", () => {
    expect(closesDrawer({ target: el("button", "[data-map-overlay]") })).toBe(false);
  });

  it("stays open for a click inside What's New or on its button", () => {
    expect(closesDrawer({ target: el(".wn-row", ".wn-panel") })).toBe(false);
    expect(closesDrawer({ target: el(".wn-trigger") })).toBe(false);
  });

  it("stays open when a press starts in What's New and ends on the map (a resize)", () => {
    expect(closesDrawer({ target: MAP, downTarget: el(".wn-resize", ".wn-panel") })).toBe(false);
  });

  it("closes when a press starts in another panel and ends on the map", () => {
    expect(closesDrawer({ target: MAP, downTarget: el(".table-panel") })).toBe(true);
  });

  it("stays open while the map is dragged, and for a click inside a popup", () => {
    expect(closesDrawer({ target: MAP, dragging: true })).toBe(false);
    expect(closesDrawer({ target: MAP, inPopup: true })).toBe(false);
  });

  it("copes with a target that is not an element", () => {
    expect(closesDrawer({ target: {} })).toBe(true);
    expect(closesDrawer({ target: null })).toBe(true);
  });

  it("lists only simple selectors, so a panel is matched by one class or attribute", () => {
    for (const s of KEEP_DRAWER_OPEN.split(",")) {
      expect(s.trim()).toMatch(/^(\.[\w-]+|\[[\w-]+\])$/);
    }
  });
});
