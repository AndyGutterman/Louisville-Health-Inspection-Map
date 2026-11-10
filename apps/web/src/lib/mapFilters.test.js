import { describe, it, expect } from "vitest";
import {
  HIDDEN,
  buildLayerFilters,
  categoryExpression,
  categoryFilter,
  dateExpression,
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
  undatedRegions: [],
  untypedRegions: [],
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

describe("dateExpression with undated counties", () => {
  it("is the plain cutoff when every county has dates", () => {
    expect(dateExpression("2026-01-01", [])).toEqual([
      ">=",
      ["coalesce", ["get", "date"], "0000-00-00"],
      "2026-01-01",
    ]);
  });

  it("lets an undated county's pins through, counting no region as Jefferson", () => {
    expect(dateExpression("2026-01-01", ["bullitt"])).toEqual([
      "any",
      ["in", ["coalesce", ["get", "region"], "jefferson"], ["literal", ["bullitt"]]],
      dateExpression("2026-01-01"),
    ]);
  });

  it("is still null for all time", () => expect(dateExpression(null, ["bullitt"])).toBeNull());
});

describe("buildLayerFilters with both counties", () => {
  it("lets Bullitt pins past the date filter by default", () => {
    const f = buildLayerFilters({ ...base, cutoffDate: "2026-01-01", undatedRegions: undefined });
    expect(f["points-green"]).toContainEqual(dateExpression("2026-01-01", ["bullitt"]));
  });

  it("never filters by county", () => {
    const f = buildLayerFilters(base);
    expect(JSON.stringify(f["points-green"])).not.toContain('"region"');
  });
});

describe("violation tap target", () => {
  it("follows the ring's filter exactly, so hidden places can't be tapped", () => {
    const f = buildLayerFilters({ ...base, searchTerm: "taco", cutoffDate: "2026-01-01" });
    expect(f["points-violation-hit"]).toEqual(f["points-violation-ring"]);
  });
});

describe("categoryFilter with counties that have no facility types", () => {
  const schoolsOnly = () => {
    const t = buildInitialCatToggles();
    for (const [k, v] of Object.entries(t)) if (k !== "schools") t[k] = { ...v, enabled: false };
    return t;
  };

  it("lets Bullitt pins through while every category is on", () => {
    const all = buildInitialCatToggles();
    expect(categoryFilter(all, ["bullitt"])).toEqual(categoryExpression(all));
  });

  it("hides Bullitt pins once the categories are narrowed", () => {
    expect(categoryFilter(schoolsOnly(), ["bullitt"])).toEqual([
      "all",
      ["!", ["in", ["coalesce", ["get", "region"], "jefferson"], ["literal", ["bullitt"]]]],
      categoryExpression(schoolsOnly()),
    ]);
  });

  it("is the plain category expression when every county has types", () => {
    expect(categoryFilter(schoolsOnly(), [])).toEqual(categoryExpression(schoolsOnly()));
  });

  it("applies to pins and rings by default", () => {
    const f = buildLayerFilters({ ...base, catToggles: schoolsOnly(), untypedRegions: undefined });
    for (const id of ["points-green", "points-violation-ring"]) {
      expect(f[id]).toContainEqual(categoryFilter(schoolsOnly(), ["bullitt"]));
    }
  });
});
