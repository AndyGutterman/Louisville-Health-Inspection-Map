/**
 * tests/fixJob.test.js — the pin-fixes job (pins/fixJob.js), and the region list it
 * reads (lib/geocodeRegions.js). No network and no database.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GEOCODE_REGIONS, geocodeRegion } from "../lib/geocodeRegions.js";
import { regionGeocoder, runFixJob } from "../pins/fixJob.js";
import { fakeSupa } from "./support/fakeSupa.js";

const quiet = { log() {}, warn() {}, error() {} };
const fix = (place_id, region = "oldham") => ({
  place_id,
  region,
  action: "address",
  address: null,
  city: "PEWEE VALLEY",
  status: "pending",
  updated_at: "2026-11-30T12:00:00.123456+00:00",
});
const place = (id) => ({
  id,
  name: `PLACE ${id}`,
  address: "3000 ASH AVE.",
  city: "PEEWEE VALLEY",
});

// A geocoder stand-in: answers by place id; "inside" means x < 1.
function stubGeocoders(answers) {
  const asked = [];
  const geocoderFor = (region, fixes) => ({
    async geocode(row) {
      asked.push([region.id, row.id, fixes.get(row.id)?.city]);
      return { query: `${row.address}, ${fixes.get(row.id)?.city}, KY`, result: answers[row.id] };
    },
    inCounty: (r) => r.lon < 1,
    keyFor: (row) => `${region.keyPrefix}|${row.id}`,
  });
  return { asked, geocoderFor };
}

function run({ pending, places, answers, recorded = () => true, limit }) {
  const { asked, geocoderFor } = stubGeocoders(answers);
  const { supa, calls } = fakeSupa((call) => {
    if (call.table === "place_fixes") return pending;
    if (call.table === "rpc/place_fix_record_result") return recorded(call.ops[0][1]);
    if (call.ops[0][0] === "select") return places;
  });
  const tally = runFixJob(supa, { log: quiet, geocoderFor, delayMs: 0, limit });
  return { tally, calls, asked };
}

const outcomes = (calls) =>
  calls
    .filter((c) => c.table === "rpc/place_fix_record_result")
    .map((c) => [c.ops[0][1].p_place_id, c.ops[0][1].p_status]);

describe("runFixJob", () => {
  it("looks up each corrected address and records found, outside and not found", async () => {
    const { tally, calls, asked } = run({
      pending: [fix("oldham-1"), fix("oldham-2"), fix("oldham-3")],
      places: [place("oldham-1"), place("oldham-2"), place("oldham-3")],
      answers: {
        "oldham-1": { lon: 0.5, lat: 0.5, provider: "census" },
        "oldham-2": { lon: 5, lat: 5, provider: "nominatim" },
        "oldham-3": null,
      },
    });
    assert.deepEqual(await tally, { found: 1, outside: 1, notFound: 1, left: 0 });
    assert.deepEqual(asked[0], ["oldham", "oldham-1", "PEWEE VALLEY"], "the corrected town");
    assert.deepEqual(outcomes(calls), [
      ["oldham-1", "found"],
      ["oldham-2", "outside"],
      ["oldham-3", "not_found"],
    ]);
    const found = calls.find((c) => c.ops[0][1]?.p_place_id === "oldham-1").ops[0][1];
    assert.deepEqual(
      [found.p_lon, found.p_provider, found.p_updated_at],
      [0.5, "census", "2026-11-30T12:00:00.123456+00:00"],
    );
    const cached = calls.filter((c) => c.table === "geocode_cache").map((c) => c.ops[0][1].key);
    assert.deepEqual(cached, ["oldham|oldham-1", "oldham|oldham-2"], "hits cached, misses not");
  });

  it("reads only pending address fixes, oldest first, and leaves the rest for next run", async () => {
    const { tally, calls } = run({
      pending: [fix("oldham-1"), fix("oldham-2"), fix("oldham-3")],
      places: [place("oldham-1"), place("oldham-2")],
      answers: {},
      limit: 2,
    });
    assert.equal((await tally).left, 1);
    const read = calls[0];
    assert.deepEqual(read.ops.slice(1), [
      ["eq", "status", "pending"],
      ["eq", "action", "address"],
      ["order", "updated_at"],
      ["limit", 3],
    ]);
    assert.equal(outcomes(calls).length, 2);
  });

  it("reads each county's places from its own table, Jefferson's by establishment_id", async () => {
    const { tally, calls } = run({
      pending: [fix("101", "jefferson"), fix("bullitt-a", "bullitt")],
      places: [place("101"), place("bullitt-a")],
      answers: {},
    });
    await tally;
    const reads = calls.filter((c) => c.ops[0][0] === "select" && c.table !== "place_fixes");
    assert.deepEqual(
      reads.map((c) => [c.table, c.ops[0][1].split(",")[0], c.ops[1]]),
      [
        ["facilities", "id:establishment_id", ["in", "establishment_id", ["101"]]],
        ["bullitt_establishments", "id:id", ["in", "id", ["bullitt-a"]]],
      ],
    );
  });

  it("says so when the source no longer lists the place", async () => {
    const { tally, calls } = run({ pending: [fix("oldham-9")], places: [], answers: {} });
    assert.equal((await tally).notFound, 1);
    const [call] = calls.filter((c) => c.table === "rpc/place_fix_record_result");
    assert.match(call.ops[0][1].p_query, /no longer lists/);
  });

  it("leaves a fix the admin changed meanwhile out of the tally", async () => {
    const { tally } = run({
      pending: [fix("oldham-1")],
      places: [place("oldham-1")],
      answers: { "oldham-1": { lon: 0.5, lat: 0.5, provider: "census" } },
      recorded: () => false,
    });
    assert.deepEqual(await tally, { found: 0, outside: 0, notFound: 0, left: 0 });
  });
});

describe("GEOCODE_REGIONS", () => {
  it("has Jefferson, Bullitt's sheet table and every portal county", () => {
    assert.deepEqual(Object.keys(GEOCODE_REGIONS).slice(0, 2), ["jefferson", "bullitt"]);
    assert.equal(GEOCODE_REGIONS.bullitt.table, "bullitt_establishments");
    assert.equal(GEOCODE_REGIONS.oldham.table, "portal_establishments");
    assert.equal(GEOCODE_REGIONS.jefferson.county911, null);
    assert.throws(() => geocodeRegion("narnia"), /Unknown region "narnia"/);
  });

  it("builds a real geocoder for every region (its outline file exists)", () => {
    for (const region of Object.values(GEOCODE_REGIONS)) {
      const geo = regionGeocoder(region, new Map());
      assert.equal(typeof geo.geocode, "function", region.id);
    }
  });

  it("keeps Jefferson's cache keys unprefixed, as geocode_missing.js writes them", () => {
    const geo = regionGeocoder(GEOCODE_REGIONS.jefferson, new Map());
    assert.equal(
      geo.keyFor({ address: "1 MAIN ST", city: "LOUISVILLE" }),
      "1 main st, louisville, ky",
    );
  });
});
