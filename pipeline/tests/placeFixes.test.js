/**
 * tests/placeFixes.test.js — fixes from the pin control center (lib/placeFixes.js).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fixedRow, handPin, missingTable, readFixes } from "../lib/placeFixes.js";
import { fakeSupa } from "./support/fakeSupa.js";

const quiet = { log() {}, warn() {}, error() {} };
const ROW = { id: "oldham-1", name: "ASH CAFE", address: "3000 ASH AVE.", city: "PEEWEE VALLEY" };

describe("fixedRow", () => {
  it("looks up the corrected town, keeping the address the fix leaves alone", () =>
    assert.deepEqual(fixedRow(ROW, { action: "address", address: null, city: "PEWEE VALLEY" }), {
      ...ROW,
      city: "PEWEE VALLEY",
    }));

  it("leaves the row as it is for any other fix, or none", () => {
    assert.equal(fixedRow(ROW, { action: "pin", address: "x", lon: -85, lat: 38 }), ROW);
    assert.equal(fixedRow(ROW, undefined), ROW);
  });
});

describe("handPin", () => {
  it("is the admin's pin for a pin fix", () =>
    assert.deepEqual(handPin({ action: "pin", lon: -85.5, lat: 38.3, note: null }), {
      lon: -85.5,
      lat: 38.3,
      note: "",
    }));

  it("is hidden for a place left off the map", () =>
    assert.deepEqual(handPin({ action: "hide", note: "food truck" }), {
      hidden: true,
      note: "food truck",
    }));

  it("is null when the geocoders decide (address, skip, no fix)", () => {
    assert.equal(handPin({ action: "address", city: "X" }), null);
    assert.equal(handPin({ action: "skip" }), null);
    assert.equal(handPin(null), null);
  });
});

describe("readFixes", () => {
  it("reads this county's fixes into a map by place id", async () => {
    const fix = { place_id: "oldham-1", region: "oldham", action: "skip" };
    const { supa, calls } = fakeSupa(() => [fix]);
    const fixes = await readFixes(supa, ["oldham"], { log: quiet });
    assert.deepEqual([...fixes], [["oldham-1", fix]]);
    assert.equal(calls[0].table, "place_fixes");
    assert.deepEqual(calls[0].ops[1], ["in", "region", ["oldham"]]);
  });

  it("is no fixes, not a failure, before the migration has made the table", async () => {
    const supa = {
      from: () => {
        const chain = {
          select: () => chain,
          in: () => chain,
          order: () => chain,
          range: async () => ({
            data: null,
            error: { code: "PGRST205", message: "Could not find the table 'public.place_fixes'" },
          }),
        };
        return chain;
      },
    };
    assert.equal((await readFixes(supa, ["oldham"], { log: quiet })).size, 0);
  });

  it("knows a missing table from any other error, which still stops the job", () => {
    assert.equal(
      missingTable({ code: "42P01", message: 'relation "place_fixes" does not exist' }),
      true,
    );
    assert.equal(
      missingTable({ code: "42501", message: "permission denied for table place_fixes" }),
      false,
    );
    assert.equal(missingTable({ message: "fetch failed" }), false);
  });
});
