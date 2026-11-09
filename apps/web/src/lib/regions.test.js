import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { REGIONS, enabledRegions, outlineLayers, outlineSourceId } from "./regions.js";

const publicFile = (url) => fileURLToPath(new URL(`../../public${url}`, import.meta.url));

describe("REGIONS", () => {
  it("have unique ids", () => {
    const ids = REGIONS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(REGIONS)("$id has an outline file with a polygon", (region) => {
    const path = publicFile(region.boundaryUrl);
    expect(existsSync(path)).toBe(true);
    const geo = JSON.parse(readFileSync(path, "utf8"));
    const types = geo.features.map((f) => f.geometry.type);
    expect(types.length).toBeGreaterThan(0);
    for (const t of types) expect(["Polygon", "MultiPolygon"]).toContain(t);
  });

  it.each(REGIONS)("$id credits its outline source", (region) => {
    expect(region.attribution).toBeTruthy();
  });

  it("covers Jefferson County today", () => {
    expect(enabledRegions().map((r) => r.id)).toEqual(["jefferson"]);
  });
});

describe("enabledRegions", () => {
  it("skips disabled regions", () => {
    const regions = [
      { id: "a", enabled: true },
      { id: "b", enabled: false },
    ];
    expect(enabledRegions(regions).map((r) => r.id)).toEqual(["a"]);
  });
});

describe("outlineLayers", () => {
  it("draws a glow and a dashed line from the region's source", () => {
    const layers = outlineLayers("jefferson");
    expect(layers.map((l) => l.id)).toEqual(["region-jefferson-glow", "region-jefferson-line"]);
    for (const l of layers) {
      expect(l.type).toBe("line");
      expect(l.source).toBe(outlineSourceId("jefferson"));
    }
    expect(layers[1].paint["line-dasharray"]).toBeTruthy();
  });

  it("gives each region its own layer ids", () => {
    const a = outlineLayers("a").map((l) => l.id);
    const b = outlineLayers("b").map((l) => l.id);
    expect(a.some((id) => b.includes(id))).toBe(false);
  });
});
