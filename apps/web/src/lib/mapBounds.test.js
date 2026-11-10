import { describe, it, expect } from "vitest";
import { METRO_BOUNDS, boundsOverlap, degreesAcross, panMargin, looseBounds } from "./mapBounds.js";
import { MIN_ZOOM } from "./constants.js";
import { regionById } from "./regions.js";

const ZOOM = 11;

describe("boundsOverlap", () => {
  const box = [
    [0, 0],
    [10, 10],
  ];
  it("is true for overlapping or touching boxes", () => {
    expect(
      boundsOverlap(box, [
        [5, 5],
        [15, 15],
      ]),
    ).toBe(true);
    expect(
      boundsOverlap(box, [
        [10, 0],
        [20, 10],
      ]),
    ).toBe(true);
  });
  it("is false for separate boxes", () => {
    expect(
      boundsOverlap(box, [
        [11, 0],
        [20, 10],
      ]),
    ).toBe(false);
    expect(
      boundsOverlap(box, [
        [0, 11],
        [10, 20],
      ]),
    ).toBe(false);
  });

  // Bullitt's pins load once the view overlaps its bounds. The map opens over downtown
  // Louisville (useMapLibre.js), which on a laptop or phone stops just north of Bullitt.
  it.each([
    ["laptop", 1280, 800],
    ["phone", 390, 844],
  ])("the opening view on a %s doesn't reach Bullitt County", (_, width, height) => {
    const [lon, lat] = [-85.75, 38.25];
    const halfLon = degreesAcross(width / 2, MIN_ZOOM);
    const halfLat = degreesAcross(height / 2, MIN_ZOOM) * Math.cos((lat * Math.PI) / 180);
    const view = [
      [lon - halfLon, lat - halfLat],
      [lon + halfLon, lat + halfLat],
    ];
    expect(boundsOverlap(view, regionById("bullitt").bounds)).toBe(false);
  });
});

describe("degreesAcross", () => {
  it("covers about 0.42 degrees of longitude across a 1237px window at zoom 11", () => {
    expect(degreesAcross(1237, ZOOM)).toBeCloseTo(0.4247, 3);
  });

  it("halves with each zoom level", () => {
    expect(degreesAcross(1000, 12)).toBeCloseTo(degreesAcross(1000, 11) / 2, 10);
  });
});

describe("panMargin", () => {
  it("never drops below the floor on small screens", () => {
    expect(panMargin(390, ZOOM)).toBe(0.3);
  });

  it("scales with the screen in between", () => {
    expect(panMargin(1920, ZOOM)).toBeCloseTo(0.395, 2);
  });

  it("never exceeds the ceiling on very large screens", () => {
    expect(panMargin(8000, ZOOM)).toBe(0.9);
  });
});

describe("looseBounds", () => {
  const [[w, s], [e, n]] = METRO_BOUNDS;
  const laptop = looseBounds(METRO_BOUNDS, { width: 1237, height: 800, zoom: ZOOM });

  it("contains the whole core box with room on every side", () => {
    expect(laptop[0][0]).toBeLessThan(w);
    expect(laptop[0][1]).toBeLessThan(s);
    expect(laptop[1][0]).toBeGreaterThan(e);
    expect(laptop[1][1]).toBeGreaterThan(n);
  });

  it("gives at least the minimum margin on each side", () => {
    expect(w - laptop[0][0]).toBeCloseTo(0.3, 6);
    expect(laptop[1][0] - e).toBeCloseTo(0.3, 6);
    expect(s - laptop[0][1]).toBeCloseTo(0.3, 6);
    expect(laptop[1][1] - n).toBeCloseTo(0.3, 6);
  });

  it("stays a valid box (west < east, south < north)", () => {
    expect(laptop[0][0]).toBeLessThan(laptop[1][0]);
    expect(laptop[0][1]).toBeLessThan(laptop[1][1]);
  });

  // The reason for all this: with two 440px panels covering over half of a window, the
  // map must be able to slide far enough to bring the east edge of the data into the
  // free part of the screen.
  it.each([1237, 1440, 1920, 2560])(
    "leaves room to clear panels covering 55%% of a %ipx-wide window",
    (width) => {
      const covered = 0.55 * degreesAcross(width, ZOOM);
      const bounds = looseBounds(METRO_BOUNDS, { width, height: 900, zoom: ZOOM });
      expect(bounds[1][0] - e).toBeGreaterThanOrEqual(covered);
    },
  );
});
