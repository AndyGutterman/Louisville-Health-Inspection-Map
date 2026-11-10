import { describe, it, expect } from "vitest";
import { featureFilter } from "@maplibre/maplibre-gl-style-spec";
import {
  HIDDEN,
  buildLayerFilters,
  capabilityExpression,
  categoryExpression,
  dateExpression,
  inRegions,
  searchExpression,
} from "./mapFilters.js";
import { CATEGORY_SPECS, buildInitialCatToggles } from "./categories.js";
import { enabledRegions } from "./regions.js";
import { PRESETS, bandExprs } from "./scoring.js";

// Whether MapLibre would draw a feature with these properties under a layer filter.
const draws = (filter, properties) =>
  featureFilter(filter).filter({ zoom: 11 }, { type: 1, properties, geometry: [] });

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
    expect(f["points-red"][2]).toEqual(
      capabilityExpression(enabledRegions(), {
        category: categoryExpression(base.catToggles),
        date: null,
      }),
    );
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
    const capability = capabilityExpression(enabledRegions(), {
      category: categoryExpression(base.catToggles),
      date: dateExpression("2026-01-01"),
    });
    for (const id of ["points-green", "points-violation-ring", "points-violation-hit"]) {
      expect(f[id]).toContainEqual(searchExpression("taco"));
      expect(f[id]).toContainEqual(capability);
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

describe("inRegions", () => {
  it("counts pins without a region as Jefferson County's (older cached pins)", () => {
    expect(draws(inRegions(["jefferson"]), {})).toBe(true);
    expect(draws(inRegions(["bullitt"]), {})).toBe(false);
    expect(draws(inRegions(["bullitt"]), { region: "bullitt" })).toBe(true);
  });
});

describe("capabilityExpression", () => {
  it("is null when no category or date filter is set", () =>
    expect(capabilityExpression(enabledRegions(), { category: null, date: null })).toBeNull());
});

// Both counties on one map: what MapLibre actually draws for each kind of pin.
describe("buildLayerFilters with both counties", () => {
  const [catKey, catSpec] = Object.entries(CATEGORY_SPECS).find(([k]) => k !== "unknown");
  const { ft, st } = catSpec.subs[0];
  const louisville = {
    region: "jefferson",
    name: "LOUISVILLE TEST CAFE",
    score: 97,
    date: "2026-10-01",
    facility_type: ft,
    subtype: st,
    cat: catKey,
    has_any_violation: true,
  };
  const bullitt = {
    region: "bullitt",
    name: "SHEPHERDSVILLE TEST DINER",
    score: 97,
    date: null,
    facility_type: null,
    subtype: null,
    cat: "unknown",
    has_any_violation: true,
  };
  const allOff = Object.fromEntries(
    Object.entries(buildInitialCatToggles()).map(([k, v]) => [k, { ...v, enabled: false }]),
  );

  it("draws both with the default filters", () => {
    const f = buildLayerFilters({ ...base, cutoffDate: "2025-11-01" });
    expect(draws(f["points-green"], louisville)).toBe(true);
    expect(draws(f["points-green"], bullitt)).toBe(true);
  });

  it("leaves Bullitt pins alone when every category is off (its data has none)", () => {
    const f = buildLayerFilters({ ...base, catToggles: allOff });
    expect(draws(f["points-green"], louisville)).toBe(false);
    expect(draws(f["points-green"], bullitt)).toBe(true);
  });

  it("applies the date filter to Louisville only (Bullitt publishes no dates)", () => {
    const f = buildLayerFilters({ ...base, cutoffDate: "2026-10-15" });
    expect(draws(f["points-green"], louisville)).toBe(false); // inspected 10/1
    expect(draws(f["points-green"], bullitt)).toBe(true);
  });

  it("applies search and the score bands to both", () => {
    const f = buildLayerFilters({ ...base, searchTerm: "diner" });
    expect(draws(f["points-green"], bullitt)).toBe(true);
    expect(draws(f["points-green"], louisville)).toBe(false);
    const greenOff = buildLayerFilters({ ...base, show: { ...allOn, green: false } });
    expect(draws(greenOff["points-green"], bullitt)).toBe(false);
  });

  it("rings Louisville's places only", () => {
    const ring = buildLayerFilters(base)["points-violation-ring"];
    expect(draws(ring, louisville)).toBe(true);
    expect(draws(ring, bullitt)).toBe(false);
  });
});

describe("violation tap target", () => {
  it("follows the ring's filter exactly, so hidden places can't be tapped", () => {
    const f = buildLayerFilters({ ...base, searchTerm: "taco", cutoffDate: "2026-01-01" });
    expect(f["points-violation-hit"]).toEqual(f["points-violation-ring"]);
  });
});
