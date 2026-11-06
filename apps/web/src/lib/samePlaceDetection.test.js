import { describe, it, expect, vi, beforeEach } from "vitest";
import { snapCoordKey, distanceM, nameSimilarity, tagSimilarNearby } from "./samePlaceDetection.js";

const feature = (eid, name, coords) => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: coords },
  properties: { establishment_id: eid, name },
});

// Same corner of the same parking lot, a metre or two apart.
const SPOT = [-85.7585, 38.2527];
const NEAR = [-85.75852, 38.25271];

beforeEach(() => {
  // tagSimilarNearby logs matches in dev; keep test output clean.
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("snapCoordKey", () => {
  it("puts points a few metres apart in the same cell", () => {
    expect(snapCoordKey(SPOT)).toBe(snapCoordKey(NEAR));
  });

  it("puts points a few hundred metres apart in different cells", () => {
    expect(snapCoordKey(SPOT)).not.toBe(snapCoordKey([-85.76, 38.26]));
  });
});

describe("distanceM", () => {
  it("is zero for the same point", () => {
    expect(distanceM(SPOT, SPOT)).toBe(0);
  });

  it("measures one degree of latitude as roughly 111 km", () => {
    expect(distanceM([-85, 38], [-85, 39])).toBeGreaterThan(111_000);
    expect(distanceM([-85, 38], [-85, 39])).toBeLessThan(111_400);
  });
});

describe("nameSimilarity", () => {
  it("scores identical names as 1", () => {
    expect(nameSimilarity("Kroger", "Kroger")).toBe(1);
  });

  it("scores two empty names as 1 (nothing to distinguish them)", () => {
    expect(nameSimilarity("", "")).toBe(1);
  });

  it("ignores apostrophes and trailing s: McDonald's vs McDonalds", () => {
    expect(nameSimilarity("McDonald's", "McDonalds")).toBeGreaterThanOrEqual(0.6);
  });

  it("treats different store numbers as different places", () => {
    expect(nameSimilarity("Subway #123", "Subway #456")).toBe(0);
    expect(nameSimilarity("Subway #123", "Subway #123")).toBe(1);
  });

  it("treats a department of a store as a different permit", () => {
    expect(nameSimilarity("Kroger", "Kroger Pharmacy")).toBe(0);
  });

  it("matches a name that just adds a legal suffix", () => {
    expect(nameSimilarity("Joe's Crab Shack", "Joes Crab Shack Inc")).toBeGreaterThanOrEqual(0.6);
    expect(nameSimilarity("Great Clips", "Great Clips Inc")).toBeGreaterThanOrEqual(0.6);
  });

  it("does not match unrelated names", () => {
    expect(nameSimilarity("Taco Bell", "Pizza Hut")).toBe(0);
  });

  describe("sub-tenants (a business inside another)", () => {
    it("flags names with a standalone 'at' or '@'", () => {
      expect(nameSimilarity("Starbucks at Kroger", "Kroger")).toBe(0);
      expect(nameSimilarity("Starbucks @ Kroger", "Starbucks")).toBe(0);
    });

    // Regression: the sub-tenant regex once used raw backspace characters
    // instead of \b, and an older copy had no word boundaries at all, which
    // would make every name containing the letters "at" a sub-tenant.
    it("does not mistake the letters 'at' inside a word for a sub-tenant", () => {
      expect(nameSimilarity("Pat's Pizza", "Pats Pizza")).toBeGreaterThanOrEqual(0.6);
      expect(nameSimilarity("Great Clips", "Great Clips Inc")).toBeGreaterThanOrEqual(0.6);
    });
  });
});

describe("tagSimilarNearby", () => {
  it("tags both sides of a similar pair with each other", () => {
    const a = feature("A", "Joe's Pizza", SPOT);
    const b = feature("B", "Joes Pizza LLC", NEAR);

    const [ta, tb] = tagSimilarNearby([a, b]);

    expect(JSON.parse(ta.properties.similar_nearby)).toEqual([
      { eid: "B", name: "Joes Pizza LLC" },
    ]);
    expect(JSON.parse(tb.properties.similar_nearby)).toEqual([{ eid: "A", name: "Joe's Pizza" }]);
  });

  it("leaves unrelated neighbours untagged", () => {
    const a = feature("A", "Joe's Pizza", SPOT);
    const b = feature("B", "Joes Pizza LLC", NEAR);
    const c = feature("C", "Walgreens", NEAR);

    const result = tagSimilarNearby([a, b, c]);

    expect(result[2].properties.similar_nearby).toBeUndefined();
  });

  it("returns the same array when nothing matches", () => {
    const features = [feature("A", "Taco Bell", SPOT), feature("B", "Pizza Hut", NEAR)];
    expect(tagSimilarNearby(features)).toBe(features);
  });

  it("does not tag similar names that are far apart", () => {
    const features = [
      feature("A", "Subway", [-85.7585, 38.2527]),
      feature("B", "Subway", [-85.65, 38.2527]),
    ];
    expect(tagSimilarNearby(features)).toBe(features);
  });

  it("does not mutate its input", () => {
    const a = feature("A", "Joe's Pizza", SPOT);
    const b = feature("B", "Joes Pizza LLC", NEAR);
    const before = JSON.stringify([a, b]);

    tagSimilarNearby([a, b]);

    expect(JSON.stringify([a, b])).toBe(before);
  });
});
