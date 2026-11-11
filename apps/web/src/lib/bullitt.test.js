import { describe, expect, it } from "vitest";
import {
  NO_DATE,
  VIOLATIONS_NOTE,
  bullittHeader,
  bullittHistory,
  buildBullittFeatures,
  estimateLabel,
  estimatedDate,
  isBullittId,
  latestHasViolations,
  latestViolationCount,
} from "./bullitt.js";
import { formatDateSafe } from "./dates.js";

const TRACKING_SINCE = "2026-11-09"; // the first load in these mocks

const feedRow = {
  establishment_id: "bullitt-f8d92cd7e863",
  premise_name: "AFC SUSHI @ KROGER #728L",
  address: "185 ADAM SHEPHERD PARKWAY",
  city: "SHEPHERDSVILLE",
  lon: -85.705,
  lat: 37.99,
  score_recent: 94,
  violation_count_recent: 3,
  follow_up_date: "2026-09-14",
  follow_up_score: 100,
};

describe("isBullittId", () => {
  it("tells Bullitt ids from Louisville ones", () => {
    expect(isBullittId("bullitt-f8d92cd7e863")).toBe(true);
    expect(isBullittId("100001")).toBe(false);
    expect(isBullittId(null)).toBe(false);
  });
});

describe("estimatedDate", () => {
  it("dates a result first seen after the first load to that day", () =>
    expect(estimatedDate("2026-11-12", TRACKING_SINCE)).toBe("2026-11-12"));

  it("can't date a result that was already there at the first load", () =>
    expect(estimatedDate(TRACKING_SINCE, TRACKING_SINCE)).toBeNull());

  it("needs both dates", () => {
    expect(estimatedDate(null, TRACKING_SINCE)).toBeNull();
    expect(estimatedDate("2026-11-12", null)).toBeNull();
  });

  it('labels an estimate "By <date>"', () =>
    expect(estimateLabel("2026-11-12")).toBe(`By ${formatDateSafe("2026-11-12")}`));
});

describe("buildBullittFeatures", () => {
  it("builds a pin with no date, grade or category", () => {
    const [f] = buildBullittFeatures([feedRow]);
    expect(f.geometry.coordinates).toEqual([-85.705, 37.99]);
    expect(f.properties).toMatchObject({
      establishment_id: "bullitt-f8d92cd7e863",
      name: "AFC SUSHI @ KROGER #728L",
      address_full: "185 ADAM SHEPHERD PARKWAY, SHEPHERDSVILLE, KY",
      date: null,
      date_text: NO_DATE,
      score: 94,
      grade: null,
      cat: "unknown",
      has_any_violation: false, // the follow-up scored 100
      follow_up_score: 100,
      region: "bullitt",
    });
  });

  it("reads numbers sent as strings and drops rows without coordinates", () => {
    const rows = [
      { ...feedRow, lon: "-85.7", lat: "37.9", score_recent: "88" },
      { ...feedRow, lon: null },
    ];
    const features = buildBullittFeatures(rows);
    expect(features).toHaveLength(1);
    expect(features[0].properties.score).toBe(88);
  });

  it("estimates the date of a result that changed after the first load", () => {
    const [changed, original] = buildBullittFeatures([
      { ...feedRow, routine_first_seen: "2026-11-12", tracking_since: TRACKING_SINCE },
      { ...feedRow, routine_first_seen: TRACKING_SINCE, tracking_since: TRACKING_SINCE },
    ]);
    expect(changed.properties).toMatchObject({
      date: null, // never mistaken for a published date (the date filter skips Bullitt)
      date_text: estimateLabel("2026-11-12"),
      date_estimated: true,
    });
    expect(original.properties).toMatchObject({ date_text: NO_DATE, date_estimated: false });
  });

  it("works with the feed from before the estimated-dates migration", () => {
    const [f] = buildBullittFeatures([feedRow]); // no routine_first_seen / tracking_since
    expect(f.properties).toMatchObject({ date_text: NO_DATE, date_estimated: false });
  });

  it("leaves an unscored place without a score or a ring", () => {
    const [f] = buildBullittFeatures([
      { ...feedRow, score_recent: null, violation_count_recent: 0 },
    ]);
    expect(f.properties.score).toBeNull();
    expect(f.properties.has_any_violation).toBe(false);
  });
});

describe("latestHasViolations (the ring)", () => {
  const withCount = (n, score = 100) => ({
    ...feedRow,
    follow_up_score: score,
    follow_up_violation_count: n,
  });

  it("follows the follow-up's listed violations, like Louisville's latest inspection", () => {
    expect(latestHasViolations(withCount(0))).toBe(false);
    expect(latestHasViolations(withCount(2))).toBe(true);
    // The list decides, not the score: the same rule as Louisville.
    expect(latestHasViolations(withCount(0, 96))).toBe(false);
    expect(latestHasViolations(withCount("1"))).toBe(true);
  });

  it("counts the latest record's violations, for the ring's fade", () => {
    expect(latestViolationCount(withCount(3))).toBe(3);
    expect(latestViolationCount(withCount("2"))).toBe(2);
    expect(latestViolationCount(feedRow)).toBe(null); // follow-up, no count yet
    expect(
      latestViolationCount({ ...feedRow, follow_up_date: null, violation_count_recent: 4 }),
    ).toBe(4);
    expect(
      latestViolationCount({ ...feedRow, follow_up_date: null, violation_count_recent: null }),
    ).toBe(0);
  });

  it("uses the follow-up's score until the feed has its count (before the migration)", () => {
    expect(latestHasViolations(feedRow)).toBe(false); // 100
    expect(latestHasViolations({ ...feedRow, follow_up_score: 96 })).toBe(true);
  });

  it("uses the routine inspection when there is no follow-up, or nothing to go on", () => {
    const noFollowUp = { ...feedRow, follow_up_date: null, follow_up_score: null };
    expect(latestHasViolations(noFollowUp)).toBe(true);
    expect(latestHasViolations({ ...noFollowUp, violation_count_recent: 0 })).toBe(false);
    expect(latestHasViolations({ ...feedRow, follow_up_score: null })).toBe(true);
  });
});

describe("bullittHistory", () => {
  const rows = [
    {
      id: 1,
      kind: "routine",
      score: 90,
      violations: ["Old item"],
      first_seen: "2026-11-10",
      last_seen: "2026-11-10",
    },
    {
      id: 2,
      kind: "routine",
      score: 94,
      violations: ["PROPER COLD HOLDING TEMPERATURES", "Food stored covered"],
      first_seen: "2026-11-17",
      last_seen: "2026-11-24",
    },
    {
      id: 3,
      kind: "follow_up",
      inspection_date: "2026-11-20",
      score: 100,
      violations: [],
      first_seen: "2026-11-24",
      last_seen: "2026-11-24",
    },
  ];

  it("lists the current follow-up, then the current routine, then older ones", () => {
    expect(bullittHistory(rows).map((r) => r.inspection_id)).toEqual([3, 2, 1]);
  });

  it("labels the undated routine inspection and keeps the follow-up's date", () => {
    const [followUp, routine] = bullittHistory(rows);
    expect(followUp).toMatchObject({
      inspection_date: "2026-11-20",
      date_label: null,
      ins_type_desc: "Follow-up",
    });
    expect(routine).toMatchObject({
      inspection_date: null,
      date_label: NO_DATE,
      ins_type_desc: "Routine",
      grade: null,
    });
  });

  it("turns each form item into a violation, all in capitals like Louisville's", () => {
    const routine = bullittHistory(rows)[1];
    expect(routine.violations.map((v) => v.violation_desc)).toEqual([
      "PROPER COLD HOLDING TEMPERATURES",
      "FOOD STORED COVERED",
    ]);
    expect(new Set(routine.violations.map((v) => v.violation_oid)).size).toBe(2);
  });

  it("explains that the items are form headings, not the inspector's notes", () => {
    const [followUp, routine] = bullittHistory(rows);
    expect(routine.violations_note).toBe(VIOLATIONS_NOTE);
    expect(followUp.violations_note).toBeNull(); // no violations, no note
  });

  // A place on the first load (first_seen 11/9), re-inspected and changed on 11/17.
  it("estimates dates only for results that appeared after the first load", () => {
    const tracked = [
      { ...rows[0], first_seen: TRACKING_SINCE, last_seen: "2026-11-16" },
      { ...rows[1], first_seen: "2026-11-17", last_seen: "2026-11-24" },
    ];
    const [current, original] = bullittHistory(tracked, { trackingSince: TRACKING_SINCE });
    expect(current).toMatchObject({
      date_label: estimateLabel("2026-11-17"),
      date_estimated: true,
    });
    expect(original).toMatchObject({ date_label: NO_DATE, date_estimated: false });
  });

  it("never estimates a follow-up, which has its own date", () => {
    const [followUp] = bullittHistory(rows, { trackingSince: TRACKING_SINCE });
    expect(followUp).toMatchObject({ date_label: null, date_estimated: false });
  });

  it("puts the current routine inspection in the header", () => {
    expect(bullittHeader(bullittHistory(rows)).inspection_id).toBe(2);
    expect(bullittHeader([])).toBeNull();
  });
});
