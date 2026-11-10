import { describe, expect, it } from "vitest";
import {
  FACILITY_CATS,
  cleanSearch,
  combineOr,
  countKey,
  countyForFacility,
  facilityAppliesTo,
  facilityFilter,
  typedCounties,
  searchFilter,
} from "./tableQuery.js";
import { CATEGORY_SPECS } from "./categories.js";

describe("cleanSearch", () => {
  it("removes characters that would break or=(...)", () => {
    expect(cleanSearch("taco, (bell)")).toBe("taco bell");
    expect(cleanSearch('50% off * "deals"')).toBe("50 off deals");
  });
  it("is empty for nothing", () => expect(cleanSearch(undefined)).toBe(""));
});

describe("searchFilter", () => {
  it("searches name, street, city and zip", () => {
    expect(searchFilter(" shep ")).toBe(
      "name.ilike.*shep*,address.ilike.*shep*,city.ilike.*shep*,zip.ilike.*shep*",
    );
  });
  it("is null for a blank term", () => expect(searchFilter(" , ")).toBeNull());
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
