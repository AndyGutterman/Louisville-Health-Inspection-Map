/**
 * tests/overrides.test.js — hand-placed pins (lib/overrides.js), and Bullitt's overrides.json
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { containsPoint } from "../lib/geo.js";
import { overrideFor, parseLatLon, parseOverrides } from "../lib/overrides.js";

const DEFAULTS = { city: "Shepherdsville", state: "KY" };

describe("parseLatLon", () => {
  it("reads 'latitude, longitude' as OpenStreetMap shows it", () =>
    assert.deepEqual(parseLatLon("38.05519, -85.53449"), { lat: 38.05519, lon: -85.53449 }));

  it("treats an empty value as not filled in yet", () => assert.equal(parseLatLon(""), null));

  it("rejects swapped or malformed coordinates", () => {
    assert.throws(() => parseLatLon("-85.53449, 38.05519"), /not in Kentucky/);
    assert.throws(() => parseLatLon("38.05 -85.53"), /latitude, longitude/);
  });
});

describe("parseOverrides and overrideFor", () => {
  const overrides = parseOverrides({
    places: [
      { query: "150 BROOKS WAY, BROOKS, KY", at: "37.9, -85.71", note: "two places" },
      { query: "1 NOT YET RD, BROOKS, KY", at: "" },
    ],
  });

  it("skips entries without coordinates", () => assert.equal(overrides.size, 1));

  it("matches every place at the address, suite or not", () => {
    for (const address of ["150 BROOKS WAY #5", "150 BROOKS WAY STE 8"]) {
      const o = overrideFor(overrides, { address, city: "BROOKS" }, DEFAULTS);
      assert.deepEqual([o.lat, o.lon], [37.9, -85.71]);
    }
    assert.equal(overrideFor(overrides, { address: "9 OTHER ST", city: "BROOKS" }, DEFAULTS), null);
  });

  it("pins only the named place when an entry gives a name", () => {
    const named = parseOverrides({
      places: [
        { query: "LA GRANGE, KY", name: "KY STATE REFORMATORY", at: "38.404, -85.417" },
        { query: "LA GRANGE, KY", name: "LUTHER LUCKETT", at: "38.412, -85.426" },
        { query: "1 MAIN ST, LA GRANGE, KY", at: "38.40, -85.37" },
        { query: "1 MAIN ST, LA GRANGE, KY", name: "Corner Café", at: "38.41, -85.38" },
      ],
    });
    const at = (row) => {
      const o = overrideFor(named, { city: "LA GRANGE", ...row }, { state: "KY" });
      return o && [o.lat, o.lon];
    };
    assert.deepEqual(at({ name: "KY State Reformatory" }), [38.404, -85.417]);
    assert.deepEqual(at({ name: "LUTHER LUCKETT" }), [38.412, -85.426]);
    assert.equal(at({ name: "SOMEWHERE ELSE" }), null); // no number: not "anywhere in town"
    assert.deepEqual(at({ name: "CORNER  CAFÉ", address: "1 MAIN ST" }), [38.41, -85.38]);
    assert.deepEqual(at({ name: "NEXT DOOR", address: "1 MAIN ST" }), [38.4, -85.37]);
  });

  it("names the entry that is wrong", () => {
    assert.throws(() => parseOverrides({ places: [{ at: "38, -85" }] }), /place 1 has no "query"/);
    assert.throws(
      () => parseOverrides({ places: [{ query: "1 A ST, B, KY", at: "nope" }] }),
      /1 A ST, B, KY/,
    );
  });
});

describe("overrides.json", () => {
  const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
  for (const [county, file] of [
    ["bullitt", "../regions/bullitt/overrides.json"],
    ["oldham", "../regions/kyportal/overrides/oldham.json"],
  ]) {
    it(`${county}: parses, and every pin is inside the county`, () => {
      const outline = read(`../../apps/web/public/regions/${county}.geojson`);
      for (const [key, o] of parseOverrides(read(file))) {
        assert.ok(containsPoint(outline, [o.lon, o.lat]), `${key} is outside the county`);
      }
    });
  }
});
