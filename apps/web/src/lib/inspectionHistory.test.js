import { describe, it, expect } from "vitest";
import { attachViolations, parseSimilarNearby, pickHeaderInspection } from "./inspectionHistory.js";

const insp = (id, date, score) => ({ inspection_id: id, inspection_date: date, score });
const viol = (oid, inspectionId, date, desc = "Floors not clean") => ({
  violation_oid: oid,
  inspection_id: inspectionId,
  inspection_date: date,
  violation_desc: desc,
});

describe("attachViolations", () => {
  it("attaches violations by inspection id", () => {
    const [a, b] = attachViolations(
      [insp(2, "2026-02-01", 90), insp(1, "2025-01-01", 95)],
      [viol(10, 2, "2026-02-01"), viol(11, 1, "2025-01-01")],
    );
    expect(a.violations.map((v) => v.violation_oid)).toEqual([10]);
    expect(b.violations.map((v) => v.violation_oid)).toEqual([11]);
  });

  it("also attaches violations cited on the same date with no matching id", () => {
    const [a] = attachViolations([insp(2, "2026-02-01", 90)], [viol(12, null, "2026-02-01")]);
    expect(a.violations.map((v) => v.violation_oid)).toEqual([12]);
  });

  it("doesn't list a violation twice when it matches by id and by date", () => {
    const [a] = attachViolations([insp(2, "2026-02-01", 90)], [viol(10, 2, "2026-02-01")]);
    expect(a.violations).toHaveLength(1);
  });

  it("keeps inspections with no violations, with an empty list", () => {
    expect(attachViolations([insp(1, "2025-01-01", 100)], null)[0].violations).toEqual([]);
  });

  it("handles a missing inspection list", () => {
    expect(attachViolations(null, [])).toEqual([]);
  });
});

describe("pickHeaderInspection", () => {
  it("picks the newest inspection when it has a score", () => {
    expect(pickHeaderInspection([insp(2, "2026", 90), insp(1, "2025", 95)]).inspection_id).toBe(2);
  });

  it("skips newer zero-score visits for the newest scored one", () => {
    expect(pickHeaderInspection([insp(3, "2026", 0), insp(2, "2025", 88)]).inspection_id).toBe(2);
  });

  it("falls back to the newest when none has a score", () => {
    expect(pickHeaderInspection([insp(3, "2026", 0), insp(2, "2025", null)]).inspection_id).toBe(3);
  });

  it("returns null for no inspections", () => {
    expect(pickHeaderInspection([])).toBeNull();
  });
});

describe("parseSimilarNearby", () => {
  it("parses the JSON list", () => {
    expect(parseSimilarNearby('[{"eid":"2","name":"X"}]')).toEqual([{ eid: "2", name: "X" }]);
  });

  it("returns an empty list for nothing or bad JSON", () => {
    expect(parseSimilarNearby(undefined)).toEqual([]);
    expect(parseSimilarNearby("{oops")).toEqual([]);
  });
});
