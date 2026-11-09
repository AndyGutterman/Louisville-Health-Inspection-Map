import { describe, it, expect, vi, beforeEach } from "vitest";
import { coordKey, worstFirst, deduplicateForRender, buildCoordIndex } from "./dedupe.js";

const feature = (eid, coords, props = {}) => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: coords },
  properties: { establishment_id: eid, name: `Place ${eid}`, ...props },
});

const HERE = [-85.7585, 38.2527];
const THERE = [-85.7, 38.3];

beforeEach(() => {
  // deduplicateForRender warns about suppressed pins; keep test output clean.
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("coordKey", () => {
  it("rounds to six decimals", () => {
    expect(coordKey([-85.7585, 38.2527])).toBe("-85.758500|38.252700");
  });
});

describe("worstFirst", () => {
  it("ignores the data's critical flag: an A with violations stays behind a C", () => {
    const a = feature("a", HERE, { has_any_violation: true, grade: "A", score: 99 });
    const c = feature("c", HERE, { grade: "C", score: 80 });
    expect([a, c].sort(worstFirst).map((f) => f.properties.establishment_id)).toEqual(["c", "a"]);
  });

  it("orders by grade (C, then B, then A), then unknown grades last", () => {
    const [c, b, a, none] = [
      feature("c", HERE, { grade: "C" }),
      feature("b", HERE, { grade: "B" }),
      feature("a", HERE, { grade: "A" }),
      feature("none", HERE, {}),
    ];
    expect([none, a, b, c].sort(worstFirst).map((f) => f.properties.establishment_id)).toEqual([
      "c",
      "b",
      "a",
      "none",
    ]);
  });

  it("breaks ties with the lower score first", () => {
    const low = feature("low", HERE, { grade: "A", score: 86 });
    const high = feature("high", HERE, { grade: "A", score: 99 });
    expect([high, low].sort(worstFirst).map((f) => f.properties.establishment_id)).toEqual([
      "low",
      "high",
    ]);
  });
});

describe("deduplicateForRender", () => {
  it("leaves features with unique coordinates untouched", () => {
    const features = [feature("1", HERE), feature("2", THERE)];
    const out = deduplicateForRender(features);
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(features[0]);
  });

  it("collapses shared coordinates into the worst establishment", () => {
    const good = feature("good", HERE, { grade: "A", score: 100 });
    const bad = feature("bad", HERE, { grade: "C", score: 70 });

    const out = deduplicateForRender([good, bad]);

    expect(out).toHaveLength(1);
    expect(out[0].properties.establishment_id).toBe("bad");
  });

  it("flags the pin if any establishment there has violations", () => {
    const clean = feature("clean", HERE, { grade: "C", score: 70 });
    const cited = feature("cited", HERE, { grade: "A", score: 99, has_any_violation: true });

    const [rep] = deduplicateForRender([clean, cited]);

    expect(rep.properties.establishment_id).toBe("clean"); // the C is the worst
    expect(rep.properties.has_any_violation).toBe(true);
  });

  it("keeps hidden neighbours searchable by name and address", () => {
    const a = feature("a", HERE, { name: "Taco Place", address: "1 Main St", grade: "C" });
    const b = feature("b", HERE, { name: "Pizza Place", address: "1 Main St", grade: "A" });

    const [rep] = deduplicateForRender([a, b]);

    expect(rep.properties.colocated_search).toContain("Taco Place");
    expect(rep.properties.colocated_search).toContain("Pizza Place");
  });

  it("does not mutate its input", () => {
    const features = [feature("a", HERE, { grade: "C" }), feature("b", HERE, { grade: "A" })];
    const before = JSON.stringify(features);
    deduplicateForRender(features);
    expect(JSON.stringify(features)).toBe(before);
  });
});

describe("buildCoordIndex", () => {
  it("groups every feature under its coordinate", () => {
    const a = feature("a", HERE);
    const b = feature("b", HERE);
    const c = feature("c", THERE);

    const index = buildCoordIndex([a, b, c]);

    expect(index.get(coordKey(HERE))).toEqual([a, b]);
    expect(index.get(coordKey(THERE))).toEqual([c]);
    expect(index.size).toBe(2);
  });
});
