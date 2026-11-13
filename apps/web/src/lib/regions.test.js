import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_REGION,
  REGIONS,
  enabledRegions,
  formItemRegionIds,
  nameList,
  outlineLayers,
  outlineSourceId,
  portalRegionIds,
  regionById,
  regionOfId,
  undatedRegionIds,
  untypedRegionIds,
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
    expect(enabledRegions().map((r) => r.id)).toEqual(["jefferson", "bullitt", "oldham"]);
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
    for (const key of ["categories", "dates", "grades", "saving", "table", "formItems"]) {
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

describe("data sources (the Learn page shows these)", () => {
  it.each(REGIONS)("$id has one https source link and a note on its data", (region) => {
    expect(region.agency.name).toBeTruthy();
    expect(region.agency.url).toMatch(/^https:\/\//);
    expect(region.source.name).toBeTruthy();
    expect(region.source.url).toMatch(/^https:\/\//);
    expect(region.dataNote.length).toBeGreaterThan(20);
  });
});

describe("undatedRegionIds", () => {
  it("lists counties whose pins can be undated", () => {
    expect(undatedRegionIds()).toEqual(["bullitt"]);
  });
});

describe("untypedRegionIds", () => {
  it("lists counties whose data has no facility types", () => {
    expect(untypedRegionIds()).toEqual(["bullitt", "oldham"]);
  });
});

describe("formItemRegionIds and portalRegionIds", () => {
  it("lists counties whose violations are form items, and those read from the portal", () => {
    expect(formItemRegionIds()).toEqual(["bullitt", "oldham"]);
    expect(portalRegionIds()).toEqual(["oldham"]);
  });
});

describe("regionOfId", () => {
  it("tells each county's ids apart, and treats the rest as Louisville's", () => {
    expect(regionOfId("bullitt-0a1b2c").id).toBe("bullitt");
    expect(regionOfId("oldham-0a1b2c").id).toBe("oldham");
    expect(regionOfId("12345").id).toBe(DEFAULT_REGION);
    expect(regionOfId("oldhamx").id).toBe(DEFAULT_REGION);
    expect(regionOfId(null).id).toBe(DEFAULT_REGION);
  });
});

describe("nameList", () => {
  it("joins names the way a sentence would", () => {
    expect(nameList([])).toBe("");
    expect(nameList(["Bullitt County"])).toBe("Bullitt County");
    expect(nameList(["A", "B"])).toBe("A and B");
    expect(nameList(["A", "B", "C"])).toBe("A, B and C");
  });
});
