import { describe, expect, it } from "vitest";
import { summarizeViolations } from "./violationSummary.js";

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
