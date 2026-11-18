import { describe, expect, it } from "vitest";
import { allCategoriesOff, shortCategoryLabel } from "./categoryTiles.js";
import { CATEGORY_SPECS, buildInitialCatToggles } from "./categories.js";

describe("shortCategoryLabel", () => {
  it("shortens the long labels", () => {
    expect(shortCategoryLabel("Hospitals & Nursing Homes")).toBe("Healthcare");
    expect(shortCategoryLabel("Caterers & Commissaries")).toBe("Kitchens");
    expect(shortCategoryLabel("Other / Unknown")).toBe("Other");
  });

  it("keeps a short label as it is", () => {
    expect(shortCategoryLabel("Restaurants")).toBe("Restaurants");
  });

  it("gives every real category a label", () => {
    for (const spec of Object.values(CATEGORY_SPECS)) {
      expect(shortCategoryLabel(spec.label)).toBeTruthy();
    }
  });
});

describe("allCategoriesOff", () => {
  it("switches off every category and every one of its type pairs", () => {
    const off = allCategoriesOff(CATEGORY_SPECS);
    expect(Object.keys(off).sort()).toEqual(Object.keys(CATEGORY_SPECS).sort());
    for (const t of Object.values(off)) {
      expect(t.enabled).toBe(false);
      expect(Object.values(t.subs).every((v) => v === false)).toBe(true);
    }
  });

  it("has the same pairs as every category on, only switched off", () => {
    const on = buildInitialCatToggles();
    const off = allCategoriesOff(CATEGORY_SPECS);
    for (const k of Object.keys(on)) {
      expect(Object.keys(off[k].subs).sort()).toEqual(Object.keys(on[k].subs).sort());
    }
  });
});
