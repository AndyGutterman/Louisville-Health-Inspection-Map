import { describe, expect, it } from "vitest";
import { WHATS_NEW_TABS, scoreBadge, swipeTab, whatsNewDate } from "./whatsNew.js";
import { formatMonthDay } from "./dates.js";

describe("WHATS_NEW_TABS", () => {
  it("is Latest, Violations, Top Scores, and opens on Latest", () => {
    expect(WHATS_NEW_TABS.map((t) => t.label)).toEqual(["Latest", "Violations", "Top Scores"]);
    expect(WHATS_NEW_TABS[0].rpc).toBe("get_latest_inspections");
  });

  it("gives every tab its own id and data source", () => {
    expect(new Set(WHATS_NEW_TABS.map((t) => t.id)).size).toBe(WHATS_NEW_TABS.length);
    expect(new Set(WHATS_NEW_TABS.map((t) => t.rpc)).size).toBe(WHATS_NEW_TABS.length);
  });
});

describe("scoreBadge", () => {
  it("bands scores like the rest of the site", () => {
    expect(scoreBadge(70)).toBe("bad");
    expect(scoreBadge(84)).toBe("bad");
    expect(scoreBadge(85)).toBe("warn");
    expect(scoreBadge(94)).toBe("warn");
    expect(scoreBadge(95)).toBe("ok");
    expect(scoreBadge(100, "latest")).toBe("ok");
  });

  it("has no colour for a missing score", () => {
    expect(scoreBadge(null)).toBe("na");
    expect(scoreBadge(0)).toBe("na");
  });

  it("uses the perfect look throughout Top Scores", () => {
    expect(scoreBadge(100, "perfect")).toBe("perfect");
  });
});

describe("swipeTab", () => {
  it("moves one tab per swipe: left is next, right is back", () => {
    expect(swipeTab("latest", -80)).toBe("issues");
    expect(swipeTab("issues", -80)).toBe("perfect");
    expect(swipeTab("perfect", 80)).toBe("issues");
    expect(swipeTab("issues", 80)).toBe("latest");
  });

  it("stops at the ends", () => {
    expect(swipeTab("latest", 80)).toBe("latest");
    expect(swipeTab("perfect", -80)).toBe("perfect");
  });
});

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
