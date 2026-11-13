import { describe, it, expect } from "vitest";
import { DATA_REFRESH_UTC_HOUR, DATE_FILTER_OPTS } from "./constants.js";

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

describe("DATA_REFRESH_UTC_HOUR", () => {
  it("is after the pipeline's daily loads (08:30 to 09:15 UTC), with room to spare", () => {
    expect(DATA_REFRESH_UTC_HOUR).toBeGreaterThanOrEqual(10);
    expect(DATA_REFRESH_UTC_HOUR).toBeLessThan(24);
  });
});
