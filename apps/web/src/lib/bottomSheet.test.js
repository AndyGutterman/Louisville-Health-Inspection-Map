import { describe, it, expect } from "vitest";
import {
  expandedHeight,
  computePeekHeight,
  clampSheetHeight,
  resolveSheetRelease,
} from "./bottomSheet.js";

const VIEWPORT = 800;
const PEEK = 380;
const EXPANDED = expandedHeight(VIEWPORT);

describe("expandedHeight", () => {
  it("covers about three quarters of the screen", () => {
    expect(expandedHeight(800)).toBe(592);
  });
});

describe("computePeekHeight", () => {
  it("shows the card, the heading and one and a half history rows", () => {
    expect(computePeekHeight({ firstRowTop: 275, rowHeight: 71, viewportH: VIEWPORT })).toBe(382);
  });

  it("uses a fallback height when there are no rows to measure", () => {
    expect(computePeekHeight({ firstRowTop: null, rowHeight: 0, viewportH: VIEWPORT })).toBe(340);
  });

  it("never grows past 60% of the screen, so a lot of map stays visible", () => {
    expect(computePeekHeight({ firstRowTop: 900, rowHeight: 70, viewportH: VIEWPORT })).toBe(480);
  });

  it("never shrinks below 240px", () => {
    expect(computePeekHeight({ firstRowTop: 10, rowHeight: 20, viewportH: VIEWPORT })).toBe(240);
  });

  it("keeps the fallback inside small screens too", () => {
    expect(computePeekHeight({ firstRowTop: null, viewportH: 400 })).toBe(240);
  });
});

describe("clampSheetHeight", () => {
  it("lets the sheet follow the finger between the limits", () => {
    expect(clampSheetHeight(450, PEEK, EXPANDED)).toBe(450);
  });

  it("stops a little above expanded", () => {
    expect(clampSheetHeight(2000, PEEK, EXPANDED)).toBe(EXPANDED + 24);
  });

  it("stops at half of peek when dragged down", () => {
    expect(clampSheetHeight(10, PEEK, EXPANDED)).toBe(190);
  });
});

describe("resolveSheetRelease", () => {
  const release = (over) =>
    resolveSheetRelease({
      height: PEEK,
      velocity: 0,
      snap: "peek",
      peekH: PEEK,
      expandedH: EXPANDED,
      ...over,
    });

  it("snaps to the closer resting height after a slow drag", () => {
    expect(release({ height: 420 })).toBe("peek");
    expect(release({ height: 540 })).toBe("expanded");
  });

  it("flinging up expands", () => {
    expect(release({ height: 400, velocity: 1.2 })).toBe("expanded");
  });

  it("flinging down from expanded returns to peek", () => {
    expect(release({ snap: "expanded", height: 500, velocity: -1 })).toBe("peek");
  });

  it("flinging down from peek closes the sheet", () => {
    expect(release({ snap: "peek", height: 360, velocity: -1 })).toBe("close");
  });

  it("dragging well below peek closes the sheet, even slowly", () => {
    expect(release({ height: PEEK - 80 })).toBe("close");
    expect(release({ snap: "expanded", height: PEEK - 80 })).toBe("close");
  });

  it("a small drag below peek does not close it", () => {
    expect(release({ height: PEEK - 30 })).toBe("peek");
  });
});
