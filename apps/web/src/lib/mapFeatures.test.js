import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildMapFeatures, joinAddress } from "./mapFeatures.js";

const row = (over = {}) => ({
  establishment_id: "1",
  premise_name: "Bluegrass Diner",
  address: "100 W MAIN ST",
  lon: -85.76,
  lat: 38.256,
  inspection_date_recent: "2026-10-01",
  score_recent: 98,
  grade_recent: "A",
  ...over,
});
const meta = (over = {}) =>
  new Map([
    [
      "1",
      {
        ft: 605,
        st: 11,
        address: "100 W MAIN ST",
        city: "LOUISVILLE",
        state: "KY",
        zip: "40202",
        ...over,
      },
    ],
  ]);

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("joinAddress", () => {
  it("joins street, city, state and zip", () => {
    expect(joinAddress({ address: "1 A ST", city: "LOUISVILLE", state: "KY", zip: "40202" })).toBe(
      "1 A ST, LOUISVILLE, KY 40202",
    );
  });

  it("skips missing parts", () => {
    expect(joinAddress({ address: "1 A ST" })).toBe("1 A ST");
    expect(joinAddress({ city: "LOUISVILLE", zip: "40202" })).toBe("LOUISVILLE 40202");
  });
});

describe("buildMapFeatures", () => {
  it("builds a point feature with the pin's properties", () => {
    const [f] = buildMapFeatures([row()], meta(), new Map());
    expect(f.geometry).toEqual({ type: "Point", coordinates: [-85.76, 38.256] });
    expect(f.properties).toMatchObject({
      establishment_id: "1",
      name: "Bluegrass Diner",
      address_full: "100 W MAIN ST, LOUISVILLE, KY 40202",
      zip: "40202",
      date: "2026-10-01",
      score: 98,
      grade: "A",
      facility_type: 605,
      subtype: 11,
      cat: "restaurants",
      has_any_violation: false,
    });
  });

  it("accepts coordinates that arrive as strings", () => {
    const [f] = buildMapFeatures([row({ lon: "-85.7", lat: "38.2" })], meta(), new Map());
    expect(f.geometry.coordinates).toEqual([-85.7, 38.2]);
  });

  it("drops rows without usable coordinates and logs them", () => {
    expect(buildMapFeatures([row({ lon: null, lat: "x" })], meta(), new Map())).toEqual([]);
    expect(console.warn).toHaveBeenCalled();
  });

  it("copies the violation flag and ignores the critical one", () => {
    const flags = new Map([["1", { has_critical: true, has_any: true }]]);
    const [f] = buildMapFeatures([row()], meta(), flags);
    expect(f.properties.has_any_violation).toBe(true);
    expect(f.properties).not.toHaveProperty("has_critical_violation");
  });

  it("marks places with no type as unknown and falls back to the feed's address", () => {
    const [f] = buildMapFeatures([row()], new Map(), new Map());
    expect(f.properties.cat).toBe("unknown");
    expect(f.properties.facility_type).toBeNull();
    expect(f.properties.address_full).toBe("100 W MAIN ST");
  });

  it("keeps one feature per establishment, the most recent", () => {
    const features = buildMapFeatures(
      [row({ inspection_date_recent: "2025-01-01", score_recent: 80 }), row()],
      meta(),
      new Map(),
    );
    expect(features).toHaveLength(1);
    expect(features[0].properties.score).toBe(98);
  });

  it("tags nearby places with similar names", () => {
    const features = buildMapFeatures(
      [row(), row({ establishment_id: "2", premise_name: "Bluegrass Diner Inc" })],
      new Map(),
      new Map(),
    );
    const similar = JSON.parse(features[0].properties.similar_nearby);
    expect(similar).toEqual([{ eid: "2", name: "Bluegrass Diner Inc" }]);
  });
});
