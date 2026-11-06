import { describe, it, expect } from "vitest";
import { DATE_FILTER_OPTS, GEO_CACHE_TTL } from "./constants.js";

describe("DATE_FILTER_OPTS", () => {
  it("has unique keys", () => {
    const keys = DATE_FILTER_OPTS.map((o) => o.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("includes the map's default of one year", () => {
    expect(DATE_FILTER_OPTS.some((o) => o.key === "1yr")).toBe(true);
  });

  it("goes from shortest to longest, ending with 'all time' (no day limit)", () => {
    const days = DATE_FILTER_OPTS.map((o) => o.days);
    const finite = days.slice(0, -1);
    expect(finite).toEqual([...finite].sort((a, b) => a - b));
    expect(days[days.length - 1]).toBeNull();
  });
});

describe("GEO_CACHE_TTL", () => {
  it("is six hours", () => {
    expect(GEO_CACHE_TTL).toBe(6 * 60 * 60 * 1000);
  });
});
