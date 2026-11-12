import { describe, expect, it } from "vitest";
import {
  FACILITY_CATS,
  combineOr,
  countKey,
  countyForFacility,
  facilityAppliesTo,
  facilityFilter,
  typedCounties,
  searchFilters,
} from "./tableQuery.js";
import { CATEGORY_SPECS } from "./categories.js";

describe("searchFilters", () => {
  it("searches name, street, city and zip with a loose regex", () => {
    expect(searchFilters(" shep ")).toEqual([
      "name.imatch.s[^a-z0-9]*h[^a-z0-9]*e[^a-z0-9]*p," +
        "address.imatch.s[^a-z0-9]*h[^a-z0-9]*e[^a-z0-9]*p," +
        "city.imatch.s[^a-z0-9]*h[^a-z0-9]*e[^a-z0-9]*p," +
        "zip.imatch.s[^a-z0-9]*h[^a-z0-9]*e[^a-z0-9]*p",
    ]);
  });
  it("builds the same filter for every spelling of McDonald's", () => {
    const want = searchFilters("mcdonalds");
    for (const t of ["McDonald's", "mc'donalds", "MCDONALD\u2019S"]) {
      expect(searchFilters(t)).toEqual(want);
    }
  });
  it("needs every word: one list per word, for combineOr", () => {
    const lists = searchFilters("mc donalds dixie");
    expect(lists).toHaveLength(3);
    expect(combineOr(...lists)).toMatch(/^and\(or\(name\.imatch\.m/);
  });
  it("never puts a character in the regex that would break or=(...)", () => {
    for (const l of searchFilters('a,(b) "c" 50% *d* e:f')) {
      for (const part of l.split(",")) expect(part).toMatch(/^\w+\.imatch\.[a-z0-9[\]^*-]+$/);
    }
  });
  it("is empty for a blank term", () => expect(searchFilters(" , ' ")).toEqual([]));
});

describe("facilityFilter", () => {
  it("is null with nothing picked", () => {
    expect(facilityFilter(null)).toBeNull();
    expect(facilityFilter(new Set())).toBeNull();
  });
  it("matches each type and subtype pair", () => {
    expect(facilityFilter(new Set(["schools"]))).toBe("and(facility_type.eq.605,subtype.eq.33)");
  });
  it("never matches untyped places: Bullitt isn't lumped into Other", () => {
    expect(facilityFilter(new Set(["unknown"]))).not.toContain("is.null");
  });
  it("uses the same pairs as the map's categories", () => {
    for (const [key, spec] of Object.entries(FACILITY_CATS)) {
      const mapPairs = CATEGORY_SPECS[key].subs.map((p) => `${p.ft}:${p.st}`).sort();
      expect(spec.pairs.map(([ft, st]) => `${ft}:${st}`).sort()).toEqual(mapPairs);
    }
  });
});

describe("combineOr", () => {
  it("passes one list through and wraps two", () => {
    expect(combineOr(null, "a.eq.1")).toBe("a.eq.1");
    expect(combineOr("a.eq.1,b.eq.2", "c.eq.3")).toBe("and(or(a.eq.1,b.eq.2),or(c.eq.3))");
    expect(combineOr(null, null)).toBeNull();
  });
});

describe("countKey", () => {
  const base = { view: "v_table_latest", region: null, hideNA: false, types: null, cats: null };
  it("ignores set order and search padding", () => {
    expect(countKey({ ...base, types: new Set(["A", "B"]), search: "x " })).toBe(
      countKey({ ...base, types: new Set(["B", "A"]), search: " x" }),
    );
  });
  it("is the same for spellings that match the same rows", () => {
    expect(countKey({ ...base, search: "McDonald's" })).toBe(
      countKey({ ...base, search: "mcdonalds" }),
    );
  });
  it("changes with any filter", () => {
    expect(countKey(base)).not.toBe(countKey({ ...base, region: "bullitt" }));
    expect(countKey(base)).not.toBe(countKey({ ...base, view: "v_table_inspections" }));
  });
});

describe("facility chips and counties", () => {
  const regions = [
    { id: "jefferson", has: { categories: true } },
    { id: "bullitt", has: { categories: false } },
  ];

  it("knows which counties have facility types", () => {
    expect(typedCounties(regions)).toEqual(["jefferson"]);
  });

  it("applies to Jefferson or to both, never to Bullitt alone", () => {
    expect(facilityAppliesTo(null, regions)).toBe(true);
    expect(facilityAppliesTo("jefferson", regions)).toBe(true);
    expect(facilityAppliesTo("bullitt", regions)).toBe(false);
  });

  it("switches both counties to Jefferson when a facility is picked", () => {
    expect(countyForFacility(null, regions)).toBe("jefferson");
    expect(countyForFacility("jefferson", regions)).toBe("jefferson");
  });

  it("stays on every county when several have facility types", () => {
    const two = [...regions, { id: "oldham", has: { categories: true } }];
    expect(countyForFacility(null, two)).toBeNull();
  });
});
