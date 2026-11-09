import { describe, it, expect } from "vitest";
import {
  HIDDEN,
  buildLayerFilters,
  categoryExpression,
  dateExpression,
  regionExpression,
  searchExpression,
} from "./mapFilters.js";
import { buildInitialCatToggles } from "./categories.js";
import { PRESETS, bandExprs } from "./scoring.js";

const allOn = { red: true, yellow: true, green: true, missing: true };
const base = {
  pins: PRESETS.balanced,
  show: allOn,
  catToggles: buildInitialCatToggles(),
  searchTerm: "",
  cutoffDate: null,
};

describe("searchExpression", () => {
  it("is null for an empty or blank term", () => {
    expect(searchExpression("")).toBeNull();
    expect(searchExpression("   ")).toBeNull();
    expect(searchExpression(undefined)).toBeNull();
  });

  it("trims and lowercases the term", () => {
    const expr = searchExpression("  Taco ");
    expect(expr[0]).toBe(">=");
    expect(expr[1][1]).toBe("taco");
  });

  it("also searches the names of places sharing a pin", () => {
    expect(JSON.stringify(searchExpression("x"))).toContain("colocated_search");
  });
});

describe("dateExpression", () => {
  it("is null for all time", () => {
    expect(dateExpression(null)).toBeNull();
  });

  it("compares the pin date to the cutoff, treating no date as oldest", () => {
    expect(dateExpression("2026-01-01")).toEqual([
      ">=",
      ["coalesce", ["get", "date"], "0000-00-00"],
      "2026-01-01",
    ]);
  });
});

describe("categoryExpression", () => {
  it("matches every known pair plus unknown when everything is on", () => {
    const expr = categoryExpression(buildInitialCatToggles());
    expect(expr[0]).toBe("any");
    expect(expr[1][2][1]).toContain("605:11"); // restaurants
    expect(expr[2]).toEqual(["==", ["get", "cat"], "unknown"]);
  });

  it("matches nothing when every category is off", () => {
    const off = buildInitialCatToggles();
    for (const k of Object.keys(off)) off[k].enabled = false;
    expect(categoryExpression(off)).toEqual(["boolean", false]);
  });

  it("matches only unknown when only Other / Unknown is on", () => {
    const toggles = buildInitialCatToggles();
    for (const k of Object.keys(toggles)) toggles[k].enabled = k === "unknown";
    expect(categoryExpression(toggles)).toEqual(["==", ["get", "cat"], "unknown"]);
  });

  it("leaves out a category that is switched off", () => {
    const toggles = buildInitialCatToggles();
    toggles.restaurants.enabled = false;
    expect(JSON.stringify(categoryExpression(toggles))).not.toContain('"605:11"');
  });
});

describe("buildLayerFilters", () => {
  it("returns a filter for all five score bands, the ring and its tap target", () => {
    expect(Object.keys(buildLayerFilters(base)).sort()).toEqual([
      "points-green",
      "points-null",
      "points-red",
      "points-violation-hit",
      "points-violation-ring",
      "points-yellow",
      "points-zero",
    ]);
  });

  it("combines the score band with the category filter", () => {
    const f = buildLayerFilters(base);
    expect(f["points-red"][0]).toBe("all");
    expect(f["points-red"][1]).toEqual(bandExprs(PRESETS.balanced).red);
    expect(f["points-red"][2]).toEqual(categoryExpression(base.catToggles));
    expect(f["points-red"]).toHaveLength(3);
  });

  it("hides a score band that is switched off", () => {
    const f = buildLayerFilters({ ...base, show: { ...allOn, yellow: false } });
    expect(f["points-yellow"]).toEqual(HIDDEN);
    expect(f["points-red"]).not.toEqual(HIDDEN);
  });

  it("hides both unscored bands when missing is off", () => {
    const f = buildLayerFilters({ ...base, show: { ...allOn, missing: false } });
    expect(f["points-zero"]).toEqual(HIDDEN);
    expect(f["points-null"]).toEqual(HIDDEN);
  });

  it("adds search and date to the pins and the rings", () => {
    const f = buildLayerFilters({ ...base, searchTerm: "taco", cutoffDate: "2026-01-01" });
    for (const id of ["points-green", "points-violation-ring", "points-violation-hit"]) {
      expect(f[id]).toContainEqual(searchExpression("taco"));
      expect(f[id]).toContainEqual(dateExpression("2026-01-01"));
    }
  });

  it("keeps rings on even when their score band is hidden", () => {
    const f = buildLayerFilters({
      ...base,
      show: { red: false, yellow: false, green: false, missing: false },
    });
    expect(f["points-violation-ring"]).not.toEqual(HIDDEN);
    expect(f["points-violation-ring"][1]).toEqual(["==", ["get", "has_any_violation"], true]);
  });
});

describe("regionExpression", () => {
  it("is null when no county is picked", () => expect(regionExpression(null)).toBeNull());

  it("counts pins without a region as Jefferson County's", () => {
    expect(regionExpression("bullitt")).toEqual([
      "==",
      ["coalesce", ["get", "region"], "jefferson"],
      "bullitt",
    ]);
  });
});

describe("buildLayerFilters by county", () => {
  it("shows only the picked county's pins and rings", () => {
    const f = buildLayerFilters({ ...base, region: "bullitt" });
    for (const id of ["points-green", "points-violation-ring"]) {
      expect(f[id]).toContainEqual(regionExpression("bullitt"));
    }
  });

  it("skips the category filter for a county without categories", () => {
    const f = buildLayerFilters({ ...base, region: "bullitt", catToggles: null });
    expect(f["points-red"]).not.toContainEqual(categoryExpression(base.catToggles));
    expect(f["points-red"]).toHaveLength(3); // "all", the band, the county
  });
});

describe("violation tap target", () => {
  it("follows the ring's filter exactly, so hidden places can't be tapped", () => {
    const f = buildLayerFilters({ ...base, searchTerm: "taco", cutoffDate: "2026-01-01" });
    expect(f["points-violation-hit"]).toEqual(f["points-violation-ring"]);
  });
});
