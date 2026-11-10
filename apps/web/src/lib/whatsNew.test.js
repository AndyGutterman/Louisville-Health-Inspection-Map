import { describe, expect, it } from "vitest";
import { whatsNewDate } from "./whatsNew.js";
import { formatMonthDay } from "./dates.js";

describe("whatsNewDate", () => {
  it("shows the inspection date", () => {
    expect(whatsNewDate({ inspection_date: "2026-11-05" })).toBe(formatMonthDay("2026-11-05"));
    expect(whatsNewDate({ inspection_date_recent: "2026-11-05" })).toBe(
      formatMonthDay("2026-11-05"),
    );
  });

  it("labels Bullitt's undated rows with the day they were posted", () => {
    expect(whatsNewDate({ inspection_date: null, posted_date: "2026-11-03" })).toBe(
      `posted ${formatMonthDay("2026-11-03")}`,
    );
  });

  it("prefers a real inspection date over the posted date", () => {
    expect(whatsNewDate({ inspection_date: "2026-11-07", posted_date: "2026-11-03" })).toBe(
      formatMonthDay("2026-11-07"),
    );
  });

  it("is empty with no date at all", () => expect(whatsNewDate({})).toBe(""));
});
