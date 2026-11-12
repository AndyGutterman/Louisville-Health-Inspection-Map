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

function geocoder({ overrides = new Map(), geocoders = {}, scope } = {}) {
  const used = [];
  const none = (name) => async () => {
    used.push(name);
    return null;
  };
  const geo = countyGeocoder(
    {
      outline: OUTLINE,
      defaults: DEFAULTS,
      county911: "Test County",
      keyPrefix: "test",
      overrides,
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

describe("distanceKm", () => {
  it("is about 111 km for a degree of latitude", () => {
    assert.ok(Math.abs(distanceKm({ lon: 0, lat: 0 }, { lon: 0, lat: 1 }) - 111.32) < 0.01);
  });
});
