import { describe, it, expect } from "vitest";
import { formatDateSafe, formatMonthDay, formatLongDate } from "./dates.js";

// What the function should print for a given calendar day, in the same locale.
const utcDay = (y, m, d) =>
  new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { timeZone: "UTC" });

describe("formatDateSafe", () => {
  it("returns n/a for empty values", () => {
    expect(formatDateSafe(null)).toBe("n/a");
    expect(formatDateSafe(undefined)).toBe("n/a");
    expect(formatDateSafe("")).toBe("n/a");
  });

  it("formats an ISO date as that calendar day", () => {
    expect(formatDateSafe("2026-10-28")).toBe(utcDay(2026, 10, 28));
  });

  it("ignores a time suffix, so a late-evening timestamp stays on its day", () => {
    expect(formatDateSafe("2026-10-28T23:59:59Z")).toBe(utcDay(2026, 10, 28));
    expect(formatDateSafe("2026-01-01T00:00:00Z")).toBe(utcDay(2026, 1, 1));
  });

  it("formats Date objects", () => {
    const d = new Date(2026, 9, 28);
    expect(formatDateSafe(d)).toBe(d.toLocaleDateString());
  });

  it("returns text it cannot parse unchanged", () => {
    expect(formatDateSafe("not a date")).toBe("not a date");
  });
});

describe("formatMonthDay", () => {
  it("returns an empty string for empty values", () => {
    expect(formatMonthDay(null)).toBe("");
    expect(formatMonthDay("")).toBe("");
  });

  it("formats an ISO date as short month and day", () => {
    const expected = new Date(Date.UTC(2026, 9, 28)).toLocaleDateString(undefined, {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
    });
    expect(formatMonthDay("2026-10-28")).toBe(expected);
    expect(formatMonthDay("2026-10-28T23:59:59Z")).toBe(expected);
  });

  it("returns text it cannot parse unchanged", () => {
    expect(formatMonthDay("later")).toBe("later");
  });
});

describe("formatLongDate", () => {
  it("returns null for empty values", () => {
    expect(formatLongDate(null)).toBeNull();
    expect(formatLongDate("")).toBeNull();
  });

  it("formats a YYYY-MM-DD string in US style", () => {
    expect(formatLongDate("2026-10-28")).toBe("Oct 28, 2026");
    expect(formatLongDate("2026-01-01")).toBe("Jan 1, 2026");
  });
});
