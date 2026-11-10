import { describe, expect, it } from "vitest";
import { DEFAULT_SORT, SORTS, sortPlaces, violationText } from "./watchAreaSort.js";

const rows = [
  { establishment_id: "a", score: 98, failing: false, violations_6mo: 1, distance_mi: 3 },
  { establishment_id: "b", score: 80, failing: true, violations_6mo: 2, distance_mi: 1 },
  { establishment_id: "c", score: 90, failing: false, violations_6mo: 4, distance_mi: 2 },
  { establishment_id: "d", score: 0, failing: false, violations_6mo: 2, distance_mi: 0.5 },
];
const ids = (list) => list.map((r) => r.establishment_id);

describe("watch area sorts", () => {
  it("defaults to Violations, labelled as such", () => {
    expect(DEFAULT_SORT).toBe("violations");
    expect(SORTS.find((s) => s.key === DEFAULT_SORT).label).toBe("Violations");
    expect(SORTS.map((s) => s.label)).not.toContain("Needs attention");
  });

  it("puts the most violations first, then failing, then the lowest score", () => {
    expect(ids(sortPlaces(rows, "violations"))).toEqual(["c", "b", "d", "a"]);
  });

  it("sorts by distance and by score", () => {
    expect(ids(sortPlaces(rows, "distance"))).toEqual(["d", "b", "c", "a"]);
    expect(ids(sortPlaces(rows, "score"))).toEqual(["a", "c", "b", "d"]);
  });

  it("doesn't change the list it was given", () => {
    const copy = rows.slice();
    sortPlaces(rows, "violations");
    expect(rows).toEqual(copy);
  });
});

describe("violationText", () => {
  it("counts six months in Jefferson County", () => {
    expect(violationText({ violations_6mo: 1 })).toBe("1 violation · 6 mo");
    expect(violationText({ violations_6mo: 3, region: "jefferson" })).toBe("3 violations · 6 mo");
  });

  it("counts Bullitt's latest inspection, which has no date", () => {
    expect(violationText({ violations_6mo: 2, region: "bullitt" })).toBe("2 violations · latest");
  });
});
