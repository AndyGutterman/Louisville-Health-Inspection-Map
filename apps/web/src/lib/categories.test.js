import { describe, it, expect } from "vitest";
import {
  CATEGORY_KEYS,
  CATEGORY_SPECS,
  DEFAULT_CATEGORIES,
  allCategoriesOn,
  buildCatToggles,
  buildInitialCatToggles,
  categoryOrFilter,
  classifyCategory,
  enabledCategories,
  readCategoryChoice,
  writeCategoryChoice,
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

describe("the categories a first visit loads", () => {
  it("are Restaurants, Retail and Kitchens, the first three tiles", () => {
    expect(DEFAULT_CATEGORIES).toEqual(CATEGORY_KEYS.slice(0, 3));
    expect(enabledCategories(buildCatToggles(DEFAULT_CATEGORIES))).toEqual(DEFAULT_CATEGORIES);
  });

  it("switches every pair of a category on or off together", () => {
    const t = buildCatToggles(["retail"]);
    expect(Object.values(t.retail.subs).every(Boolean)).toBe(true);
    expect(t.schools).toEqual({ enabled: false, subs: { "605:33": false } });
  });
});

describe("the saved category choice", () => {
  const storage = (value) => ({
    getItem: () => value,
    setItem(_, v) {
      this.saved = v;
    },
  });

  it("is the default when nothing is saved, or it can't be read", () => {
    expect(readCategoryChoice(storage(null))).toEqual(DEFAULT_CATEGORIES);
    expect(readCategoryChoice(storage("{nope"))).toEqual(DEFAULT_CATEGORIES);
    expect(readCategoryChoice(null)).toEqual(DEFAULT_CATEGORIES);
  });

  it("comes back in the panel's order, without unknown keys", () => {
    expect(readCategoryChoice(storage('["schools","nope","restaurants"]'))).toEqual([
      "restaurants",
      "schools",
    ]);
  });

  it("keeps 'everything off' as a choice", () => {
    expect(readCategoryChoice(storage("[]"))).toEqual([]);
  });

  it("saves, and says so", () => {
    const s = storage(null);
    expect(writeCategoryChoice(s, ["schools"])).toBe(true);
    expect(s.saved).toBe('["schools"]');
    expect(writeCategoryChoice(null, ["schools"])).toBe(false);
  });
});

describe("categoryOrFilter", () => {
  it("lists a category's (type, subtype) pairs", () => {
    expect(categoryOrFilter(["restaurants"])).toBe("and(facility_type.eq.605,subtype.eq.11)");
    expect(categoryOrFilter(["schools", "concessions"])).toBe(
      "and(facility_type.eq.605,subtype.eq.33)," +
        "and(facility_type.eq.603,subtype.eq.51),and(facility_type.eq.603,subtype.eq.53)",
    );
  });

  it("asks for 'Other' as whatever no category claims, untyped places included", () => {
    const f = categoryOrFilter(["unknown"]);
    expect(f.startsWith("facility_type.is.null,subtype.is.null,not.or(")).toBe(true);
    // Every pair another category claims is ruled out, and Other's own pairs are not.
    for (const [key, spec] of Object.entries(CATEGORY_SPECS)) {
      for (const p of spec.subs) {
        const pair = `and(facility_type.eq.${p.ft},subtype.eq.${p.st})`;
        expect(f.includes(pair), `${key} ${pair}`).toBe(key !== "unknown");
      }
    }
  });

  it("needs no filter when every category is asked for", () => {
    expect(categoryOrFilter(CATEGORY_KEYS)).toBeNull();
    expect(categoryOrFilter(CATEGORY_KEYS.slice(1))).not.toBeNull();
  });
});
