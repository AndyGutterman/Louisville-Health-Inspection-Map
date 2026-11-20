/**
 * tests/importPlan.test.js — overrides.json entries -> place_fixes rows (pins/importPlan.js),
 * and every county's real overrides.json read with its hidden entries.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseOverrides } from "../lib/overrides.js";
import { COUNTIES } from "../regions/kyportal/counties.js";
import { planImport } from "../pins/importPlan.js";

const DEFAULTS = { city: "La Grange", state: "KY" };
const entries = parseOverrides(
  {
    places: [
      {
        query: "LA GRANGE, KY",
        name: "KY STATE REFORMATORY",
        at: "38.40403, -85.41744",
        note: "OSM",
      },
      { query: "150 BROOKS WAY, LA GRANGE, KY", at: "38.06013, -85.70516", note: "strip mall" },
      { query: "2002 E. 10TH STREET, JEFF, KY", at: "", note: "Kona Ice" },
      { query: "9 GONE RD, LA GRANGE, KY", at: "38.4, -85.4" },
    ],
  },
  { withHidden: true },
);
const place = (id, name, address, city = "LA GRANGE") => ({ id, name, address, city });

describe("planImport", () => {
  const { fixes, unmatched } = planImport({
    region: "oldham",
    entries,
    defaults: DEFAULTS,
    places: [
      place("oldham-1", "KY STATE REFORMATORY", ""),
      place("oldham-2", "LUTHER LUCKETT", ""), // same address, other name: not this pin
      place("oldham-3", "EL MAGUEY", "150 BROOKS WAY STE 4"),
      place("oldham-4", "LITTLE VILLAGE", "150 BROOKS WAY STE 8"),
      place("oldham-5", "KONA ICE", "2002 E. 10TH STREET", "JEFF"),
      place("oldham-6", "ELSEWHERE", "1 MAIN ST"),
    ],
  });
  const byId = Object.fromEntries(fixes.map((f) => [f.place_id, f]));

  it("gives a named entry's pin to that place only", () => {
    assert.deepEqual([byId["oldham-1"].lon, byId["oldham-1"].lat], [-85.41744, 38.40403]);
    assert.equal(byId["oldham-2"], undefined);
  });

  it("gives an address's pin to every place there, each its own fix", () => {
    assert.equal(byId["oldham-3"].action, "pin");
    assert.equal(byId["oldham-4"].action, "pin");
  });

  it("turns an entry left without coordinates into a hide", () => {
    assert.deepEqual([byId["oldham-5"].action, byId["oldham-5"].lon], ["hide", null]);
    assert.equal(byId["oldham-5"].note, "Kona Ice (from overrides.json)");
  });

  it("keeps the place as the source has it, with no earlier pin to restore", () => {
    const f = byId["oldham-3"];
    assert.deepEqual(
      [f.region, f.status, f.source_name, f.source_address, f.source_lon],
      ["oldham", "done", "EL MAGUEY", "150 BROOKS WAY STE 4", null],
    );
  });

  it("lists entries that match no place", () =>
    assert.deepEqual(unmatched, ["9 gone rd, la grange, ky"]));

  it("leaves a place that already has a fix alone", () => {
    const again = planImport({
      region: "oldham",
      entries,
      defaults: DEFAULTS,
      places: [place("oldham-1", "KY STATE REFORMATORY", "")],
      existing: new Set(["oldham-1"]),
    });
    assert.deepEqual(again.fixes, []);
    assert.equal(again.unmatched.includes("la grange, ky|ky state reformatory"), false);
  });
});

describe("every county's overrides.json", () => {
  for (const county of Object.values(COUNTIES)) {
    it(`${county.id}: reads, hidden entries included`, () => {
      const json = JSON.parse(readFileSync(new URL(`../../${county.overrides}`, import.meta.url)));
      const all = parseOverrides(json, { withHidden: true });
      assert.equal(all.size, json.places.length);
    });
  }
});
