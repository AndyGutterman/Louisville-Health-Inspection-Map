import { describe, expect, it } from "vitest";
import { applyAreaEdit, withoutZone } from "./watchAreaEdits.js";

const areas = [
  { id: "a", label: "Home", radius_miles: 2, center_lat: 38.2, center_lon: -85.7 },
  { id: "b", label: "Work", radius_miles: 1, center_lat: 38.3, center_lon: -85.6 },
];

describe("applyAreaEdit", () => {
  it("changes only the edited area's fields", () => {
    const next = applyAreaEdit(areas, { id: "a", update: { radius_miles: 4 } });
    expect(next[0]).toEqual({ ...areas[0], radius_miles: 4 });
    expect(next[1]).toBe(areas[1]);
  });

  it("moves an area's centre and address", () => {
    const update = { center_lat: 38.25, center_lon: -85.75, center_address: "38.2500, -85.7500" };
    const next = applyAreaEdit(areas, { id: "b", update });
    expect(next[1]).toMatchObject(update);
    expect(next[1].label).toBe("Work");
  });

  it("returns the same list for no edit, or for an area it doesn't have", () => {
    expect(applyAreaEdit(areas, null)).toBe(areas);
    expect(applyAreaEdit(areas, { id: "zzz", update: { radius_miles: 3 } })).toBe(areas);
  });

  it("never changes the list it was given", () => {
    applyAreaEdit(areas, { id: "a", update: { radius_miles: 5 } });
    expect(areas[0].radius_miles).toBe(2);
  });
});

describe("withoutZone", () => {
  it("drops one area's cached places and keeps the rest", () => {
    const zones = { a: { rows: [1] }, b: { rows: [2] } };
    expect(withoutZone(zones, "a")).toEqual({ b: { rows: [2] } });
    expect(zones.a).toBeDefined();
  });

  it("returns the same object when there is nothing to drop", () => {
    const zones = { b: { rows: [] } };
    expect(withoutZone(zones, "a")).toBe(zones);
  });
});
