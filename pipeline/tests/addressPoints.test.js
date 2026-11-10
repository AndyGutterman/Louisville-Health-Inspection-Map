/**
 * tests/addressPoints.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildStreetIndex,
  levenshtein,
  matchAddress,
  parseStreetAddress,
  streetTokens,
} from "../lib/addressPoints.js";

const MW = "MOUNT WASHINGTON";
const pt = (number, name, postType, lon, lat, extra = {}) => ({
  number,
  name,
  postType,
  town: MW,
  lon,
  lat,
  ...extra,
});

// Shaped like Kentucky's 911 points (full words, mixed case).
const streets = buildStreetIndex([
  pt(117, "High Point", "Court", -85.54, 38.054),
  pt(209, "High Point", "Court", -85.538, 38.056),
  pt(130, "Hope", "Street", -85.534, 38.044),
  pt(300, "Hope", "Street", -85.532, 38.043),
  pt(330, "Rope", "Street", -85.6, 38.1), // a decoy one letter away
  pt(156, "Erin", "Circle", -85.548, 38.047),
  pt(294, "Boxwood", "Run", -85.561, 38.041),
  pt(334, "Boxwood", "Run", -85.56, 38.042),
  pt(6340, "44", null, -85.614, 38.026, { preType: "Highway", postDir: "East" }),
  pt(275, "Keystone Crossroads", "Drive", -85.708, 37.993, { town: "Shepherdsville" }),
  pt(335, "Keystone Crossroads", "Drive", -85.7084, 37.994, { town: "Shepherdsville" }),
  pt(100, "Long", "Road", -85.6, 38.0),
  pt(300, "Long", "Road", -85.6, 38.03), // over 3 km from 100
  pt(null, "Broken", "Road", -85.6, 38.0), // no number: ignored
]);

describe("streetTokens", () => {
  it("expands abbreviations to the words 911 data uses", () =>
    assert.deepEqual(streetTokens("High Pointe Ct."), ["HIGH", "POINTE", "COURT"]));

  it("reads a leading ST as Saint, not Street", () =>
    assert.deepEqual(streetTokens("ST JOHNS RD"), ["ST", "JOHNS", "ROAD"]));

  it("spells out highways and directions", () =>
    assert.deepEqual(streetTokens("HWY 44 E"), ["HIGHWAY", "44", "EAST"]));
});

describe("parseStreetAddress", () => {
  it("splits the house number from the street", () =>
    assert.deepEqual(parseStreetAddress("149 HIGH POINTE CT"), {
      number: 149,
      tokens: ["HIGH", "POINTE", "COURT"],
    }));

  it("returns null without a house number", () => {
    assert.equal(parseStreetAddress("PO BOX 12"), null);
    assert.equal(parseStreetAddress(""), null);
  });
});

describe("levenshtein", () => {
  it("counts single-character edits", () => {
    assert.equal(levenshtein("POINT", "POINTE"), 1);
    assert.equal(levenshtein("HISTORIC", "HISTORICAL"), 2);
    assert.equal(levenshtein("same", "same"), 0);
  });
});

describe("matchAddress", () => {
  const match = (address, city = MW) => matchAddress(streets, { address, city });

  it("finds an exact address written with abbreviations", () => {
    const r = match("6340 HWY 44 E");
    assert.equal(r.provider, "ky911");
    assert.deepEqual([r.lon, r.lat], [-85.614, 38.026]);
  });

  it("accepts a misspelled street when it has the exact number", () => {
    const r = match("335 KEYSTONE CROSSING DRIVE", "SHEPHERDSVILLE");
    assert.equal(r.provider, "ky911");
    assert.equal(r.raw.matched, "335 KEYSTONE CROSSROADS DRIVE");
  });

  it("puts a missing number between its neighbours, marked approximate", () => {
    const r = match("149 HIGH POINTE CT");
    assert.equal(r.provider, "ky911-approx");
    assert.equal(r.raw.method, "between 117 and 209");
    assert.ok(r.lon > -85.54 && r.lon < -85.538);
  });

  it("allows a different or extra street type", () => {
    assert.equal(match("156 ERIN COURT").raw.matched, "156 ERIN CIRCLE");
    assert.equal(match("310 BOXWOOD RUN RD").raw.matched, "310 BOXWOOD RUN");
  });

  it("stays on the closest street even when a near-miss one has the number", () => {
    const r = match("330 HOPE STREET");
    assert.equal(r.raw.matched, "330 HOPE STREET");
    assert.equal(r.raw.method, "next to 300");
  });

  it("only places approximate pins in the same town", () =>
    assert.equal(match("149 HIGH POINTE CT", "SHEPHERDSVILLE"), null));

  it("gives up when the neighbours are far apart or the street is unknown", () => {
    assert.equal(match("200 LONG RD"), null);
    assert.equal(match("127 PEREGRINE RD"), null);
    assert.equal(match("PO BOX 5"), null);
  });
});
