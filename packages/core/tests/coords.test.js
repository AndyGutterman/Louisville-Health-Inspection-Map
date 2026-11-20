import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatLatLon, inKentucky, parseLatLon } from "../coords.js";

describe("parseLatLon", () => {
  it("reads 'latitude, longitude' as Google Maps and OpenStreetMap copy it", () => {
    assert.deepEqual(parseLatLon("38.05519, -85.53449"), { lat: 38.05519, lon: -85.53449 });
    assert.deepEqual(parseLatLon(" (38.1,-85.7) "), { lat: 38.1, lon: -85.7 });
  });

  it("treats an empty value as not filled in yet", () => {
    assert.equal(parseLatLon(""), null);
    assert.equal(parseLatLon(null), null);
  });

  it("rejects swapped or malformed coordinates", () => {
    assert.throws(() => parseLatLon("-85.53449, 38.05519"), /not in Kentucky/);
    assert.throws(() => parseLatLon("38.05 -85.53"), /latitude, longitude/);
    assert.throws(() => parseLatLon("40.7, -74.0"), /not in Kentucky/);
  });
});

describe("inKentucky", () => {
  it("is true inside the box and false outside or for missing numbers", () => {
    assert.equal(inKentucky({ lat: 38.25, lon: -85.76 }), true);
    assert.equal(inKentucky({ lat: 38.25, lon: 85.76 }), false);
    assert.equal(inKentucky({ lat: null, lon: -85.76 }), false);
  });
});

describe("formatLatLon", () => {
  it("writes latitude first, five decimals", () =>
    assert.equal(formatLatLon({ lat: 38.308331, lon: -85.491519 }), "38.30833, -85.49152"));
});
