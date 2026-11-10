import { describe, expect, it } from "vitest";
import {
  NO_DATE,
  bullittHeader,
  bullittHistory,
  buildBullittFeatures,
  isBullittId,
} from "./bullitt.js";

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
      has_any_violation: true,
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

  it("leaves an unscored place without a score or a ring", () => {
    const [f] = buildBullittFeatures([
      { ...feedRow, score_recent: null, violation_count_recent: 0 },
    ]);
    expect(f.properties.score).toBeNull();
    expect(f.properties.has_any_violation).toBe(false);
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

  it("turns each form item into a violation", () => {
    const routine = bullittHistory(rows)[1];
    expect(routine.violations.map((v) => v.violation_desc)).toEqual([
      "PROPER COLD HOLDING TEMPERATURES",
      "Food stored covered",
    ]);
    expect(new Set(routine.violations.map((v) => v.violation_oid)).size).toBe(2);
  });

  it("puts the current routine inspection in the header", () => {
    expect(bullittHeader(bullittHistory(rows)).inspection_id).toBe(2);
    expect(bullittHeader([])).toBeNull();
  });
});
