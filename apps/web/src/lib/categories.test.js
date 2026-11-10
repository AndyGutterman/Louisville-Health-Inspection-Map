import { describe, it, expect } from "vitest";
import {
  CATEGORY_SPECS,
  allCategoriesOn,
  buildInitialCatToggles,
  classifyCategory,
} from "./categories.js";

describe("CATEGORY_SPECS", () => {
  it("gives every category a label and at least one (facility type, subtype) pair", () => {
    for (const [key, spec] of Object.entries(CATEGORY_SPECS)) {
      expect(spec.label, key).toBeTruthy();
      expect(spec.subs.length, key).toBeGreaterThan(0);
    }
  });

  // (610, 73) used to be listed under both Retail and Other / Unknown, so turning
  // Retail off still left those places visible while Other was on.
  it("lists each pair under only one category", () => {
    const seen = new Map();
    const dupes = [];
    for (const [key, spec] of Object.entries(CATEGORY_SPECS)) {
      for (const { ft, st } of spec.subs) {
        const id = `${ft}:${st}`;
        if (seen.has(id)) dupes.push(`${id} in ${seen.get(id)} and ${key}`);
        else seen.set(id, key);
      }
    }
    expect(dupes).toEqual([]);
  });
});

describe("classifyCategory", () => {
  it.each([
    [605, 11, "restaurants"],
    [605, 33, "schools"],
    [605, 31, "daycare"],
    [605, 32, "hospitals"],
    [603, 51, "concessions"],
    [605, 42, "caterers_commissary"],
    [610, 61, "retail"],
  ])("maps (%i, %i) to %s", (ft, st, expected) => {
    expect(classifyCategory(ft, st)).toBe(expected);
  });

  it("falls back to unknown for pairs it does not recognise", () => {
    expect(classifyCategory(999, 999)).toBe("unknown");
    expect(classifyCategory(undefined, undefined)).toBe("unknown");
  });

  it("puts (610, 73) in Retail", () => {
    expect(classifyCategory(610, 73)).toBe("retail");
  });
});

describe("buildInitialCatToggles", () => {
  const toggles = buildInitialCatToggles();

  it("starts with every category enabled", () => {
    for (const key of Object.keys(CATEGORY_SPECS)) {
      expect(toggles[key].enabled, key).toBe(true);
    }
  });

  it("creates one enabled 'ft:st' toggle per pair", () => {
    for (const [key, spec] of Object.entries(CATEGORY_SPECS)) {
      const subs = toggles[key].subs;
      expect(Object.keys(subs), key).toHaveLength(spec.subs.length);
      for (const { ft, st } of spec.subs) expect(subs[`${ft}:${st}`], key).toBe(true);
    }
  });

  it("returns a fresh object each time", () => {
    expect(buildInitialCatToggles()).not.toBe(toggles);
  });
});

describe("allCategoriesOn", () => {
  it("is true for the starting toggles and false once anything is off", () => {
    const t = buildInitialCatToggles();
    expect(allCategoriesOn(t)).toBe(true);
    expect(allCategoriesOn({ ...t, schools: { ...t.schools, enabled: false } })).toBe(false);
    const sub = Object.keys(t.retail.subs)[0];
    expect(
      allCategoriesOn({ ...t, retail: { ...t.retail, subs: { ...t.retail.subs, [sub]: false } } }),
    ).toBe(false);
  });
});
