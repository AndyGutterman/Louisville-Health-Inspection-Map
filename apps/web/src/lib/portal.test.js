import { describe, expect, it } from "vitest";
import {
  NOT_INSPECTED,
  SEVERAL_RESULTS_NOTE,
  buildPortalFeatures,
  hasSeveralResults,
  portalHeader,
  portalHistory,
  portalSourceNote,
} from "./portal.js";

// Shaped like v_portal_map_feed (migration 20261121000000).
const feedRow = (extra = {}) => ({
  establishment_id: "oldham-0000000000a1",
  region: "oldham",
  premise_name: "LA GRANGE TEST DINER",
  address: "100 MAIN ST",
  city: "LA GRANGE",
  lon: "-85.379",
  lat: "38.407",
  score_recent: 94,
  violation_count_recent: 2,
  routine_date: "2026-11-05",
  follow_up_date: null,
  follow_up_score: null,
  follow_up_violation_count: null,
  ...extra,
});

describe("buildPortalFeatures", () => {
  it("builds a dated pin in its own county, with no grade or category", () => {
    const [f] = buildPortalFeatures([feedRow()]);
    expect(f.geometry.coordinates).toEqual([-85.379, 38.407]);
    expect(f.properties).toMatchObject({
      establishment_id: "oldham-0000000000a1",
      region: "oldham",
      address_full: "100 MAIN ST, LA GRANGE, KY",
      date: "2026-11-05",
      date_estimated: false,
      score: 94,
      grade: null,
      cat: "unknown",
      has_any_violation: true,
      violation_count: 2,
    });
  });

  it("leads with a scored follow-up, like Bullitt's and Louisville's latest record", () => {
    const [f] = buildPortalFeatures([
      feedRow({
        follow_up_date: "2026-11-10",
        follow_up_score: 100,
        follow_up_violation_count: 0,
      }),
    ]);
    expect(f.properties).toMatchObject({ date: "2026-11-10", score: 100 });
    expect(f.properties.has_any_violation).toBe(false);
  });

  it("says a place with no result yet hasn't been inspected", () => {
    const [f] = buildPortalFeatures([
      feedRow({ score_recent: null, violation_count_recent: 0, routine_date: null }),
    ]);
    expect(f.properties).toMatchObject({ date: null, score: null, date_text: NOT_INSPECTED });
    expect(f.properties.has_any_violation).toBe(false);
  });

  it("drops rows without coordinates", () => {
    expect(buildPortalFeatures([feedRow({ lon: null })])).toEqual([]);
  });
});

// Shaped like portal_inspections.
const result = (id, kind, inspection_date, score, extra = {}) => ({
  id,
  kind,
  inspection_date,
  score,
  violations: [],
  first_seen: "2026-11-01",
  last_seen: "2026-11-12",
  ...extra,
});

describe("portalHistory", () => {
  const county = "Oldham County";

  it("lists the latest load newest first, the follow-up before its routine inspection", () => {
    const rows = portalHistory(
      [
        result(1, "routine", "2026-03-01", 90, { last_seen: "2026-11-01" }), // replaced
        result(2, "routine", "2026-11-05", 96),
        result(3, "follow_up", "2026-11-10", 100),
      ],
      { county },
    );
    expect(rows.map((r) => r.inspection_id)).toEqual([3, 2, 1]);
    expect(rows.map((r) => r.ins_type_desc)).toEqual(["Follow-up", "Routine", "Routine"]);
    expect(rows[0].date_label).toBeNull(); // dated: no "Date not published"
  });

  it("puts the lowest of one day's results first, as the map does", () => {
    const rows = portalHistory(
      [result(5, "routine", "2026-11-05", 100), result(6, "routine", "2026-11-05", 92)],
      { county },
    );
    expect(rows.map((r) => r.score)).toEqual([92, 100]);
    expect(portalHeader(rows).score).toBe(92);
  });

  it("names the county above the form items, in capitals like Louisville's", () => {
    const [row] = portalHistory(
      [result(7, "routine", "2026-11-05", 97, { violations: ["Food stored covered"] })],
      { county },
    );
    expect(row.violations.map((v) => v.violation_desc)).toEqual(["FOOD STORED COVERED"]);
    expect(row.violations_note).toContain("Oldham County doesn't publish the inspector's notes");
  });
});

describe("portalHeader", () => {
  it("skips a follow-up with no score yet", () => {
    const rows = portalHistory(
      [result(1, "routine", "2026-11-05", 96), result(2, "follow_up", "2026-11-10", null)],
      { county: "Oldham County" },
    );
    expect(portalHeader(rows).inspection_id).toBe(1);
  });

  it("is null with no results", () => expect(portalHeader([])).toBeNull());
});

describe("portalSourceNote and hasSeveralResults", () => {
  const agency = "Oldham County Health Department";
  const history = (rows) => portalHistory(rows, { county: "Oldham County" });

  it("credits the portal", () => {
    const note = portalSourceNote(history([result(1, "routine", "2026-11-05", 96)]), agency);
    expect(note).toMatch(/^From the Oldham County Health Department, through Kentucky's/);
    expect(note).not.toContain(SEVERAL_RESULTS_NOTE);
  });

  it("explains a day with two results (a school's kitchen and its playground)", () => {
    const rows = history([
      result(1, "routine", "2026-11-05", 100),
      result(2, "routine", "2026-11-05", 92),
    ]);
    expect(hasSeveralResults(rows)).toBe(true);
    expect(portalSourceNote(rows, agency)).toContain(SEVERAL_RESULTS_NOTE);
  });

  it("doesn't count an older load's result on the same day", () => {
    const rows = history([
      result(1, "routine", "2026-11-05", 100),
      result(2, "routine", "2026-11-05", 92, { last_seen: "2026-11-06" }), // corrected since
    ]);
    expect(hasSeveralResults(rows)).toBe(false);
  });
});
