import { describe, expect, it } from "vitest";
import { groupViolations } from "./violationGroups.js";

const v = (desc, comment, extra = {}) => ({
  violation_desc: desc,
  insp_viol_comments: comment,
  ...extra,
});

describe("groupViolations", () => {
  it("makes one row per kind of violation, with a count", () => {
    const rows = groupViolations([v("Hand washing", "sink"), v("Hand washing", "soap")]);
    expect(rows).toHaveLength(1);
    expect(rows[0]._count).toBe(2);
    expect(rows[0].insp_viol_comments).toBe("sink | soap");
  });

  it("keeps the order the violations were first cited in", () => {
    const rows = groupViolations([v("B", "1"), v("A", "2"), v("B", "3")]);
    expect(rows.map((r) => r.violation_desc)).toEqual(["B", "A"]);
  });

  it("lists a repeated comment once and skips empty ones", () => {
    const rows = groupViolations([v("A", "same"), v("A", "same"), v("A", null), v("A", "")]);
    expect(rows[0]._count).toBe(4);
    expect(rows[0].insp_viol_comments).toBe("same");
  });

  it("files citations with no description together", () => {
    const rows = groupViolations([v(null, "x"), v(undefined, "y")]);
    expect(rows).toHaveLength(1);
    expect(rows[0]._count).toBe(2);
  });

  it("keeps the first citation's other fields, such as its id", () => {
    const rows = groupViolations([
      v("A", "1", { violation_oid: 7 }),
      v("A", "2", { violation_oid: 8 }),
    ]);
    expect(rows[0].violation_oid).toBe(7);
  });

  it("returns nothing for no violations", () => {
    expect(groupViolations([])).toEqual([]);
    expect(groupViolations(null)).toEqual([]);
  });
});
