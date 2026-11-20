/**
 * tests/dataLoads.test.js — the stamp that tells the website a county's data changed.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { markLoaded } from "../lib/dataLoads.js";
import { fakeSupa } from "./support/fakeSupa.js";

const quiet = { log() {}, warn() {} };

// A client whose every call fails with `error`.
const failing = (error) => ({
  from: () => ({ upsert: async () => ({ data: null, error }) }),
});

describe("markLoaded", () => {
  it("upserts one row for the county, keyed by region", async () => {
    const { supa, calls } = fakeSupa();
    const now = new Date("2026-11-21T14:30:00Z");
    assert.equal(await markLoaded(supa, "jefferson", { now, log: quiet }), true);
    assert.deepEqual(calls, [
      {
        table: "data_loads",
        ops: [
          [
            "upsert",
            { region: "jefferson", loaded_at: "2026-11-21T14:30:00.000Z" },
            { onConflict: "region" },
          ],
        ],
      },
    ]);
  });

  it("carries on before the migration has run", async () => {
    const warnings = [];
    const log = { log() {}, warn: (m) => warnings.push(m) };
    const ok = await markLoaded(failing({ code: "PGRST205", message: "x" }), "bullitt", { log });
    assert.equal(ok, false);
    assert.match(warnings[0], /20261203000000/);
  });

  it("carries on after any other error too: the load already succeeded", async () => {
    const ok = await markLoaded(failing({ code: "500", message: "boom" }), "bullitt", {
      log: quiet,
    });
    assert.equal(ok, false);
  });

  it("refuses something that isn't a county id", async () => {
    const { supa } = fakeSupa();
    await assert.rejects(markLoaded(supa, undefined, { log: quiet }), /county id/);
    await assert.rejects(markLoaded(supa, "Jefferson; drop", { log: quiet }), /county id/);
  });
});
