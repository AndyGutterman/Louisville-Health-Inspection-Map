import { describe, expect, it } from "vitest";
import { citationShare, summarizeViolations } from "./violationSummary.js";

describe("citationShare", () => {
  it("rounds to a whole percent at 10% and up", () => {
    expect(citationShare(475, 2692, "en-US")).toBe("~18%");
  });

  it("keeps one decimal below 10%", () => {
    expect(citationShare(118, 2692, "en-US")).toBe("~4.4%");
    expect(citationShare(3, 2692, "en-US")).toBe("~0.1%");
  });

  it("says <0.1% for the rarest", () => {
    expect(citationShare(1, 2692, "en-US")).toBe("<0.1%");
  });

  it("uses the locale's decimal mark", () => {
    expect(citationShare(118, 2692, "es-ES")).toBe("~4,4%");
  });

  it("is empty when there is nothing to divide", () => {
    expect(citationShare(5, 0)).toBe("");
    expect(citationShare(0, 10)).toBe("");
  });
});

describe("summarizeViolations", () => {
  it("merges rows with the same description", () => {
    expect(
      summarizeViolations([
        { desc: "Floors not clean", count: 3 },
        { desc: "Floors not clean", count: 2 },
      ]),
    ).toEqual([{ desc: "Floors not clean", count: 5 }]);
  });

  it("puts the most cited first, then alphabetical", () => {
    const out = summarizeViolations([
      { desc: "B", count: 1 },
      { desc: "C", count: 4 },
      { desc: "A", count: 1 },
    ]);
    expect(out.map((r) => r.desc)).toEqual(["C", "A", "B"]);
  });

  it("skips rows without a description and treats bad counts as 0", () => {
    expect(
      summarizeViolations([
        { desc: null, count: 9 },
        { desc: "X", count: "2" },
        { desc: "X", count: undefined },
      ]),
    ).toEqual([{ desc: "X", count: 2 }]);
  });
});
