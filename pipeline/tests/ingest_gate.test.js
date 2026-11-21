/**
 * tests/ingest_gate.test.js — when Louisville's load runs (lib/ingestGate.js,
 * source_check.js). A wrong "nothing changed" leaves the map stale; a wrong "changed"
 * costs a full load of database egress.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  LAYERS,
  MAX_LOADS_PER_DAY,
  decide,
  fingerprint,
  statisticsFor,
} from "../lib/ingestGate.js";
import { check } from "../source_check.js";

const at = (iso) => Date.parse(iso);
const STATS = {
  inspections: { n: 11682, sum_InspectionID: 23786818927, sum_EstablishmentID: 1, sum_score: 9 },
  violations: { n: 3621, sum_InspectionID: 6709274998, sum_InspTypeSpecificViolID: 100521 },
  establishments: { n: 3441, sum_permit_number: 1, sum_facility_type: 2, sum_subtype: 3 },
  types: { n: 17, sum_facility_type: 4, sum_subtype: 5 },
};
const FP = fingerprint(STATS);
const loadedAt = (iso, more = {}) => ({
  fingerprint: FP,
  lastLoadAt: iso,
  day: iso.slice(0, 10),
  loadsToday: 1,
  ...more,
});

describe("fingerprint", () => {
  it("is the same for the same numbers in any key order", () => {
    const shuffled = { ...STATS, types: { sum_subtype: 5, n: 17, sum_facility_type: 4 } };
    assert.equal(fingerprint(shuffled), FP);
  });

  it("changes when a row is added, or a rolling window swaps rows at the same count", () => {
    const added = { ...STATS, inspections: { ...STATS.inspections, n: 11683 } };
    const swapped = {
      ...STATS,
      inspections: { ...STATS.inspections, sum_InspectionID: 23786818927 + 41 },
    };
    assert.notEqual(fingerprint(added), FP);
    assert.notEqual(fingerprint(swapped), FP);
  });

  it("refuses a missing or broken layer instead of calling it unchanged", () => {
    assert.throws(() => fingerprint({ ...STATS, violations: undefined }), /violations/);
    assert.throws(() => fingerprint({ ...STATS, types: { error: "x" } }), /types/);
  });
});

describe("statisticsFor", () => {
  it("asks for the row count and a sum of each column", () => {
    const stats = JSON.parse(statisticsFor(LAYERS[0]));
    assert.deepEqual(
      stats.map((s) => s.statisticType),
      ["count", "sum", "sum", "sum"],
    );
    assert.deepEqual(
      stats.map((s) => s.outStatisticFieldName),
      ["n", "sum_InspectionID", "sum_EstablishmentID", "sum_score"],
    );
  });
});

describe("LAYERS", () => {
  it("covers every city layer the load reads", () => {
    const urls = new Set(LAYERS.map((l) => l.url));
    const scripts = readdirSync(new URL("..", import.meta.url)).filter((f) =>
      /^(seed_|overlay_|backfill_).*\.js$/.test(f),
    );
    assert.ok(scripts.length >= 5);
    for (const file of scripts) {
      const src = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
      for (const [url] of src.matchAll(/https:\/\/services1\.arcgis\.com\/[^"'`\s]+/g)) {
        assert.ok(urls.has(url), `${file} reads ${url}, which the source check doesn't watch`);
      }
    }
  });
});

describe("decide", () => {
  const now = at("2026-11-20T16:23:00Z");

  it("skips when nothing changed since a recent load", () => {
    const r = decide({ state: loadedAt("2026-11-20T14:23:00Z"), fingerprint: FP, now });
    assert.equal(r.run, false);
    assert.match(r.reason, /nothing new/);
  });

  it("loads when the data changed, and counts the attempt before the load", () => {
    const r = decide({ state: loadedAt("2026-11-19T14:23:00Z"), fingerprint: "new", now });
    assert.equal(r.run, true);
    assert.deepEqual(r.attempt, {
      fingerprint: FP, // still the old one: a failed load is tried again
      lastLoadAt: "2026-11-19T14:23:00Z",
      day: "2026-11-20",
      loadsToday: 1, // yesterday's count doesn't carry over
    });
    assert.deepEqual(r.done, {
      fingerprint: "new",
      lastLoadAt: "2026-11-20T16:23:00.000Z",
      day: "2026-11-20",
      loadsToday: 1,
    });
  });

  it(`stops at ${MAX_LOADS_PER_DAY} loads a day, failed attempts included`, () => {
    const state = loadedAt("2026-11-20T10:23:00Z", { loadsToday: MAX_LOADS_PER_DAY });
    const r = decide({ state, fingerprint: "new", now });
    assert.equal(r.run, false);
    assert.match(r.reason, /cap/);
    // The next day the count starts again and the change is loaded.
    assert.equal(decide({ state, fingerprint: "new", now: at("2026-11-21T00:23:00Z") }).run, true);
  });

  it("loads on the first run, when there is no state", () => {
    const r = decide({ state: null, fingerprint: FP, now });
    assert.equal(r.run, true);
    assert.equal(r.attempt.fingerprint, null);
    assert.equal(r.done.loadsToday, 1);
  });

  it("loads once a week even when nothing seems to change", () => {
    const r = decide({ state: loadedAt("2026-11-12T16:00:00Z"), fingerprint: FP, now });
    assert.equal(r.run, true);
    assert.match(r.reason, /7 days/);
  });

  it("waits while the city is part-way through publishing", () => {
    const r = decide({
      state: loadedAt("2026-11-19T14:23:00Z"),
      fingerprint: "new",
      now,
      newestEdit: now - 5 * 60 * 1000,
    });
    assert.equal(r.run, false);
    assert.match(r.reason, /publishing/);
    const later = decide({
      state: loadedAt("2026-11-19T14:23:00Z"),
      fingerprint: "new",
      now,
      newestEdit: now - 60 * 60 * 1000,
    });
    assert.equal(later.run, true);
  });

  it("always loads when run by hand, past the cap and with nothing new", () => {
    const state = loadedAt("2026-11-20T15:00:00Z", { loadsToday: 9 });
    assert.equal(decide({ state, fingerprint: FP, now, manual: true }).run, true);
  });
});

describe("check (source_check.js)", () => {
  // A fake city: statistics for every layer, edited an hour before `now`.
  const now = at("2026-11-20T16:23:00Z");
  const city = (stats = STATS) => {
    const calls = [];
    const get = async (url) => {
      calls.push(url);
      const layer = LAYERS.find((l) => url.startsWith(l.url));
      if (url.includes("/query?")) return { features: [{ attributes: stats[layer.name] }] };
      return { editingInfo: { dataLastEditDate: now - 60 * 60 * 1000 } };
    };
    return { get, calls };
  };
  const quiet = { log() {} };
  const tempDir = () => mkdtempSync(join(tmpdir(), "ingest-gate-"));

  it("writes run=false and no state files when nothing changed", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "state.json"), JSON.stringify(loadedAt("2026-11-20T14:23:00Z")));
    const output = join(dir, "out");
    const r = await check({ get: city().get, dir, now, output, log: quiet });
    assert.equal(r.run, false);
    assert.equal(readFileSync(output, "utf8"), "run=false\n");
    assert.deepEqual(readdirSync(dir).sort(), ["out", "state.json"]);
  });

  it("writes run=true with the attempt and the done state when the data changed", async () => {
    const dir = tempDir();
    const output = join(dir, "out");
    writeFileSync(join(dir, "state.json"), JSON.stringify(loadedAt("2026-11-19T14:23:00Z")));
    const changed = { ...STATS, inspections: { ...STATS.inspections, n: 11690 } };
    const { get, calls } = city(changed);
    const r = await check({ get, dir, now, output, log: quiet });
    assert.equal(r.run, true);
    assert.equal(readFileSync(output, "utf8"), "run=true\n");
    assert.equal(JSON.parse(readFileSync(join(dir, "state.json"), "utf8")).fingerprint, FP);
    assert.equal(
      JSON.parse(readFileSync(join(dir, "done.json"), "utf8")).fingerprint,
      fingerprint(changed),
    );
    assert.equal(calls.length, LAYERS.length * 2); // statistics + edit time, per layer
    assert.ok(calls.every((u) => u.startsWith("https://services1.arcgis.com/")));
  });

  it("fails, rather than skipping, when the city answers with an error", async () => {
    const dir = tempDir();
    const get = async () => ({ error: { code: 500 } });
    await assert.rejects(check({ get, dir, now, output: join(dir, "out"), log: quiet }));
  });
});
