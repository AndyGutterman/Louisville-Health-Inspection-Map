/**
 * tests/bullitt_versions.test.js — a week of mocked daily sheets: what each run stores.
 *
 * The website estimates an undated routine inspection's date from the day its result first
 * appeared (first_seen). These runs check that first_seen is exactly the day a result
 * changed, and that an unchanged sheet adds nothing.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { COLUMNS, parseSheet } from "../regions/bullitt/parse.js";
import { planVersions, versionKey } from "../regions/bullitt/versions.js";

const HEADER = COLUMNS.map((c) => `"${c}"`).join(",");
const row = (name, address, city, score, violations = "", fu = ["", "", ""]) =>
  [name, address, city, score, violations, ...fu].map((c) => `"${c}"`).join(",");
const sheet = (...rows) => parseSheet([HEADER, ...rows].join("\n") + "\n").establishments;

const CRACKER_BARREL_V1 = row(
  "CRACKER BARREL OLD COUNTRY STORE",
  "275 BRENTON WAY",
  "SHEPHERDSVILLE",
  "84",
  "Nonfood-contact surfaces clean; Physical facilities installed, maintained and clean",
  ["6/11/2026", "95", "Physical facilities installed, maintained and clean"],
);
const CRACKER_BARREL_V2 = row(
  "CRACKER BARREL OLD COUNTRY STORE",
  "275 BRENTON WAY",
  "SHEPHERDSVILLE",
  "97",
  "Nonfood-contact surfaces clean",
);
const DINER = row("SHEPHERDSVILLE TEST DINER", "100 MAIN ST", "SHEPHERDSVILLE", "96");
const NEW_CAFE = row("MOUNT WASHINGTON NEW CAFE", "5 MAIN ST", "MOUNT WASHINGTON", "100");

// Runs the job's version step over consecutive days, keeping what it stores.
function runDays(days) {
  const stored = new Map(); // versionKey -> row
  const log = [];
  for (const [day, establishments] of days) {
    const { fresh, kept } = planVersions(establishments, new Set(stored.keys()), day);
    for (const r of fresh) stored.set(versionKey(r), r);
    for (const r of kept) stored.set(versionKey(r), { ...stored.get(versionKey(r)), ...r });
    log.push({ day, fresh, kept });
  }
  return { stored: [...stored.values()], log };
}

describe("planVersions over a week of daily sheets", () => {
  const { stored, log } = runDays([
    ["2026-11-09", sheet(CRACKER_BARREL_V1, DINER)], // first load
    ["2026-11-10", sheet(CRACKER_BARREL_V1, DINER)], // unchanged
    ["2026-11-11", sheet(DINER, CRACKER_BARREL_V1)], // same rows, another order
    ["2026-11-12", sheet(CRACKER_BARREL_V2, DINER, NEW_CAFE)], // re-inspected; a new place
  ]);

  it("stores every result on the first load, dated that day", () => {
    assert.equal(log[0].fresh.length, 3); // routine + follow-up, and the diner's routine
    assert.ok(log[0].fresh.every((r) => r.first_seen === "2026-11-09"));
  });

  it("adds nothing when the sheet is unchanged or only reordered", () => {
    assert.equal(log[1].fresh.length, 0);
    assert.equal(log[2].fresh.length, 0);
    assert.equal(log[2].kept.length, 3);
  });

  it("dates a changed result and a new place to the day they appeared", () => {
    const fresh = log[3].fresh.map((r) => [r.kind, r.score, r.first_seen]);
    assert.deepEqual(fresh, [
      ["routine", 97, "2026-11-12"],
      ["routine", 100, "2026-11-12"],
    ]);
  });

  it("keeps the earlier versions, so the history shows both", () => {
    const barrel = stored.filter((r) => r.kind === "routine" && r.score !== 96 && r.score !== 100);
    assert.deepEqual(
      barrel.map((r) => [r.score, r.first_seen, r.last_seen]),
      [
        [84, "2026-11-09", "2026-11-11"],
        [97, "2026-11-12", "2026-11-12"],
      ],
    );
  });

  it("stops updating a follow-up once it leaves the sheet", () => {
    const followUp = stored.find((r) => r.kind === "follow_up");
    assert.equal(followUp.inspection_date, "2026-06-11");
    assert.equal(followUp.last_seen, "2026-11-11");
  });
});
