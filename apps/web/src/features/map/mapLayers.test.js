// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  BULLITT_RING_FADE,
  OTHER_COUNTY_RING_COLOR,
  RING_COLOR,
  ringColor,
  addPinLayers,
} from "./mapLayers.js";
import { PRESETS } from "../../lib/scoring.js";

// The ring colour as MapLibre would pick it for a pin with this region property:
// ["case", ["==", ["coalesce", ["get", "region"], "jefferson"], "jefferson"], red, gold].
const colourFor = (region) => {
  const [, [, [, , fallback], jefferson], ifJefferson, otherwise] = ringColor;
  return (region ?? fallback) === jefferson ? ifJefferson : otherwise;
};
const rgb = (c) =>
  c
    .match(/[\d.]+/g)
    .slice(0, 3)
    .map(Number);

describe("violation ring colours", () => {
  it("are amber-red for Louisville and goldenrod for every other county", () => {
    expect(colourFor(undefined)).toBe(RING_COLOR); // a Louisville pin may have no region
    expect(colourFor("jefferson")).toBe(RING_COLOR);
    for (const county of ["bullitt", "oldham", "shelby", "spencer"]) {
      expect(colourFor(county)).toBe(OTHER_COUNTY_RING_COLOR);
    }
  });

  it("are two different colours, a red and a gold, and no blue", () => {
    const [r, g, b] = rgb(RING_COLOR);
    expect(r).toBeGreaterThan(200);
    expect(g).toBeLessThan(80);
    expect(b).toBeLessThan(80);
    const [r2, g2, b2] = rgb(OTHER_COUNTY_RING_COLOR);
    expect(r2).toBeGreaterThan(200);
    expect(g2).toBeGreaterThan(140);
    expect(b2).toBeLessThan(60);
  });

  it("are drawn by the ring layer, which fades the other counties by violation count", () => {
    const layers = [];
    const map = { addSource: vi.fn(), addLayer: (l) => layers.push(l) };
    addPinLayers(map, { type: "FeatureCollection", features: [] }, PRESETS.balanced);
    const ring = layers.find((l) => l.paint?.["circle-stroke-opacity"]);
    expect(ring.paint["circle-stroke-color"]).toEqual(ringColor);
    expect(JSON.stringify(ring.paint["circle-stroke-opacity"])).toContain("violation_count");
    expect(BULLITT_RING_FADE.count).toEqual([1, 5]);
  });
});
