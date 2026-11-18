/**
 * tests/countyGeocode.test.js — the shared county geocoder (lib/countyGeocode.js). No
 * network and no database: the geocoders, the 911 download and Supabase are stand-ins.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { countyGeocoder, distanceKm } from "../lib/countyGeocode.js";
import { parseOverrides } from "../lib/overrides.js";
import { fakeSupa } from "./support/fakeSupa.js";

// A square "county" from (0,0) to (1,1).
const OUTLINE = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        ],
      },
    },
  ],
};
const DEFAULTS = { city: "Townsville", state: "KY" };
const quiet = { log() {}, warn() {}, error() {} };

function geocoder({ overrides = new Map(), fixes, geocoders = {}, scope, county911 } = {}) {
  const used = [];
  const none = (name) => async () => {
    used.push(name);
    return null;
  };
  const geo = countyGeocoder(
    {
      outline: OUTLINE,
      defaults: DEFAULTS,
      county911: county911 === undefined ? "Test County" : county911,
      keyPrefix: "test",
      overrides,
      fixes,
      table: "test_places",
      scope,
    },
    {
      log: quiet,
      delayMs: 0,
      addressPoints: async () => {
        used.push("911");
        return [];
      },
      geocoders: {
        geocodeCensus: none("census"),
        geocodeNominatim: none("nominatim"),
        geocodeCensusLine: none("censusLine"),
        ...geocoders,
      },
    },
  );
  return { geo, used };
}

const ROW = { id: "test-1", name: "DINER", address: "1 MAIN ST", city: "TOWNSVILLE" };

describe("countyGeocoder.geocode", () => {
  it("uses a hand-placed pin without asking any geocoder", async () => {
    const overrides = parseOverrides({
      places: [{ query: "1 MAIN ST, TOWNSVILLE, KY", at: "38.5, -85.5", note: "by hand" }],
    });
    const { geo, used } = geocoder({ overrides });
    const { result } = await geo.geocode(ROW);
    assert.deepEqual([result.provider, result.lat, result.lon], ["manual", 38.5, -85.5]);
    assert.deepEqual(used, []);
  });

  it("takes the first match inside the county, in order", async () => {
    const { geo, used } = geocoder({
      geocoders: {
        geocodeCensus: async () => ({ lon: 5, lat: 5, provider: "census" }), // outside
        geocodeNominatim: async () => ({ lon: 0.5, lat: 0.5, provider: "nominatim" }),
      },
    });
    const { result } = await geo.geocode(ROW);
    assert.equal(result.provider, "nominatim");
    assert.deepEqual(used, ["911"]);
  });

  it("doesn't ask the Census about a place with no street address", async () => {
    const { geo, used } = geocoder();
    const { result } = await geo.geocode({ ...ROW, address: "" });
    assert.equal(result, null);
    assert.deepEqual(used, ["911", "nominatim"]);
  });

  it("keeps a match outside the county when nothing is inside, so it can be flagged", async () => {
    const { geo } = geocoder({
      geocoders: { geocodeCensus: async () => ({ lon: 5, lat: 5, provider: "census" }) },
    });
    const { result } = await geo.geocode(ROW);
    assert.equal(result.provider, "census");
    assert.equal(geo.inCounty(result), false);
  });

  it("downloads the 911 points once, however many places it geocodes", async () => {
    const { geo, used } = geocoder();
    await geo.geocode(ROW);
    await geo.geocode({ ...ROW, id: "test-2", address: "2 MAIN ST" });
    assert.equal(used.filter((u) => u === "911").length, 1);
  });
});

describe("countyGeocoder.geocodeMissing", () => {
  it("reads only this county's places, and pins from the cache without geocoding", async () => {
    const { geo, used } = geocoder({ scope: (q) => q.eq("region", "test") });
    const { supa, calls } = fakeSupa((call) => {
      if (call.table === "test_places" && call.ops[0][0] === "select") return [ROW];
      if (call.table === "geocode_cache") {
        return [{ key: geo.keyFor(ROW), lon: 0.25, lat: 0.75, provider: "census" }];
      }
    });
    const tally = await geo.geocodeMissing(supa);
    assert.deepEqual(tally, { hits: 1, outside: 0, misses: 0, moved: 0 });
    assert.deepEqual(used, [], "no geocoder asked");

    const [read] = calls;
    assert.deepEqual(read.ops[1], ["eq", "region", "test"], "scoped to the county");
    const save = calls.find((c) => c.ops[0][0] === "update");
    assert.equal(save.table, "test_places");
    assert.deepEqual([save.ops[0][1].lon, save.ops[0][1].lat], [0.25, 0.75]);
    assert.deepEqual(save.ops[1], ["eq", "id", "test-1"]);
  });

  it("keys the cache by county, so another county's lookup of the same text is not used", () => {
    const { geo } = geocoder();
    assert.equal(geo.keyFor(ROW), "test|1 main st, townsville, ky");
  });

  it("does nothing when every place already has a pin", async () => {
    const { geo } = geocoder();
    const { supa, calls } = fakeSupa(() => []);
    assert.deepEqual(await geo.geocodeMissing(supa), { hits: 0, outside: 0, misses: 0, moved: 0 });
    assert.equal(calls.length, 1);
  });
});

describe("countyGeocoder with the pin control center's fixes", () => {
  const fixes = (...list) => new Map(list.map((f) => [f.place_id, f]));
  const JSON_PIN = parseOverrides({
    places: [{ query: "1 MAIN ST, TOWNSVILLE, KY", at: "38.5, -85.5", note: "json" }],
  });

  it("uses the admin's pin over overrides.json and every geocoder", async () => {
    const { geo, used } = geocoder({
      overrides: JSON_PIN,
      fixes: fixes({ place_id: "test-1", action: "pin", lon: 0.4, lat: 0.6, note: "by hand" }),
    });
    const { result } = await geo.geocode(ROW);
    assert.deepEqual([result.provider, result.lon, result.lat], ["manual", 0.4, 0.6]);
    assert.deepEqual(used, []);
  });

  it("asks no geocoder about a place left off the map", async () => {
    const { geo, used } = geocoder({ fixes: fixes({ place_id: "test-1", action: "hide" }) });
    const out = await geo.geocode(ROW);
    assert.deepEqual([out.result, out.hidden], [null, true]);
    assert.deepEqual(used, []);
  });

  it("looks up the corrected address, and caches it under the corrected query", async () => {
    const asked = [];
    const { geo } = geocoder({
      fixes: fixes({ place_id: "test-1", action: "address", address: null, city: "TOWNVILLE" }),
      geocoders: {
        geocodeCensus: async (row) => {
          asked.push(row.city);
          return { lon: 0.5, lat: 0.5, provider: "census" };
        },
      },
    });
    const { query, result } = await geo.geocode(ROW);
    assert.equal(query, "1 MAIN ST, TOWNVILLE, KY");
    assert.deepEqual(asked, ["TOWNVILLE"]);
    assert.equal(result.provider, "census");
    assert.equal(geo.keyFor(ROW), "test|1 main st, townville, ky");
  });

  it("skips the 911 step for a county without 911 points (Jefferson)", async () => {
    const { geo, used } = geocoder({ county911: null });
    await geo.geocode(ROW);
    assert.deepEqual(used, ["census", "nominatim", "censusLine"]);
  });

  it("never geocodes a hidden place, and redo spares pins placed or hidden by hand", async () => {
    const { geo, used } = geocoder({ fixes: fixes({ place_id: "test-2", action: "hide" }) });
    const { supa, calls } = fakeSupa((call) =>
      call.table === "test_places" && call.ops[0][0] === "select"
        ? [
            { ...ROW, id: "test-2" },
            { ...ROW, id: "test-3", geocode_provider: "hidden" },
          ]
        : [],
    );
    const tally = await geo.geocodeMissing(supa, { redo: true });
    assert.deepEqual(tally, { hits: 0, outside: 0, misses: 0, moved: 0 });
    assert.deepEqual(used, []);
    assert.deepEqual(calls[0].ops.at(-1), [
      "or",
      "geocode_provider.is.null,geocode_provider.not.in.(manual,hidden)",
    ]);
  });

  it("applyHandPins puts back moved pins and hides, and leaves ones already right", async () => {
    const { geo } = geocoder({
      fixes: fixes(
        { place_id: "test-1", action: "pin", lon: 0.4, lat: 0.6 },
        { place_id: "test-2", action: "hide" },
        { place_id: "test-3", action: "pin", lon: 0.1, lat: 0.1 },
        { place_id: "test-4", action: "skip" },
      ),
    });
    const { supa, calls } = fakeSupa((call) =>
      call.ops[0][0] === "select"
        ? [
            { ...ROW, lon: 0.9, lat: 0.9, geocode_provider: "census" },
            { ...ROW, id: "test-2", lon: 0.2, lat: 0.2, geocode_provider: "census" },
            { ...ROW, id: "test-3", lon: 0.1, lat: 0.1, geocode_provider: "manual" },
            { ...ROW, id: "test-4", lon: null, lat: null },
          ]
        : [],
    );
    assert.equal(await geo.applyHandPins(supa), 2);
    const saves = calls.filter((c) => c.ops[0][0] === "update");
    assert.deepEqual(
      saves.map((c) => [c.ops[1][2], c.ops[0][1].geocode_provider, c.ops[0][1].lon]),
      [
        ["test-1", "manual", 0.4],
        ["test-2", "hidden", null],
      ],
    );
  });

  it("applyHandPins reads nothing when there are no hand pins", async () => {
    const { geo } = geocoder({ fixes: fixes({ place_id: "test-4", action: "skip" }) });
    const { supa, calls } = fakeSupa();
    assert.equal(await geo.applyHandPins(supa), 0);
    assert.equal(calls.length, 0);
  });
});

describe("distanceKm", () => {
  it("is about 111 km for a degree of latitude", () => {
    assert.ok(Math.abs(distanceKm({ lon: 0, lat: 0 }, { lon: 0, lat: 1 }) - 111.32) < 0.01);
  });
});
