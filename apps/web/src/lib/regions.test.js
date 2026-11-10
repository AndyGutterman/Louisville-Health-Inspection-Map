import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_REGION,
  REGIONS,
  enabledRegions,
  outlineLayers,
  outlineSourceId,
  SHARED_SOURCES,
  regionById,
  undatedRegionIds,
} from "./regions.js";

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

  it("covers Jefferson and Bullitt counties", () => {
    expect(enabledRegions().map((r) => r.id)).toEqual(["jefferson", "bullitt"]);
  });

  // The map flies to `bounds` when a county is picked, so they must frame the outline.
  it.each(REGIONS)("$id bounds frame its outline", (region) => {
    const geo = JSON.parse(readFileSync(publicFile(region.boundaryUrl), "utf8"));
    const points = geo.features.flatMap((f) => f.geometry.coordinates.flat(2));
    const [[w, s], [e, n]] = region.bounds;
    for (let i = 0; i < points.length; i += 2) {
      const [lon, lat] = [points[i], points[i + 1]];
      expect(lon).toBeGreaterThanOrEqual(w - 0.001);
      expect(lon).toBeLessThanOrEqual(e + 0.001);
      expect(lat).toBeGreaterThanOrEqual(s - 0.001);
      expect(lat).toBeLessThanOrEqual(n + 0.001);
    }
  });

  it.each(REGIONS)("$id says what its data can show", (region) => {
    for (const key of ["categories", "dates", "grades", "saving"]) {
      expect(typeof region.has[key]).toBe("boolean");
    }
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

describe("regionById", () => {
  it("finds a county, and falls back to the default one", () => {
    expect(regionById("bullitt").id).toBe("bullitt");
    expect(regionById("nowhere").id).toBe(DEFAULT_REGION);
  });
});

describe("data sources (the Learn page lists these)", () => {
  it.each(REGIONS)("$id names its agency and at least one https source", (region) => {
    expect(region.agency.name).toBeTruthy();
    expect(region.agency.url).toMatch(/^https:\/\//);
    expect(region.sources.length).toBeGreaterThan(0);
    for (const s of region.sources) {
      expect(s.name).toBeTruthy();
      expect(s.url).toMatch(/^https:\/\//);
    }
  });

  it("shared sources are https links too", () => {
    for (const s of SHARED_SOURCES) expect(s.url).toMatch(/^https:\/\//);
  });
});

describe("undatedRegionIds", () => {
  it("lists counties whose data has no inspection dates", () => {
    expect(undatedRegionIds()).toEqual(["bullitt"]);
  });
});
