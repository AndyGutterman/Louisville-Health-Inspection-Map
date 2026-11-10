/**
 * tests/geocode.test.js — the pure helpers in lib/geocode.js (no network).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildQuery, cacheKey, firstInside, isBuildingMatch, stripSuite } from "../lib/geocode.js";

describe("stripSuite", () => {
  it("drops a suite number", () => assert.equal(stripSuite("123 MAIN ST STE 104"), "123 MAIN ST"));
  it("drops a unit marker", () => assert.equal(stripSuite("9 ELM AVE # 2"), "9 ELM AVE"));
  it("leaves a plain street alone", () =>
    assert.equal(stripSuite("100 W MAIN ST"), "100 W MAIN ST"));
  it("drops a building", () =>
    assert.equal(stripSuite("5122 NORTH PRESTON BLDG E"), "5122 NORTH PRESTON"));
  it("drops a unit number after a #", () =>
    assert.equal(stripSuite("6434 NORTH PRESTON HIGHWAY #4"), "6434 NORTH PRESTON HIGHWAY"));

  // These once lost everything after the house number ("123 FLOYD ST" -> "123").
  for (const street of [
    "123 FLOYD ST",
    "500 STEWART AVE",
    "1 UNITY WAY",
    "9 BOXWOOD LN",
    "6434 NORTH PRESTON HWY",
    "77 NOBLE DR",
    "12 APTOS CT",
    "4 ROOMS RD",
  ]) {
    it(`keeps "${street}" whole`, () => assert.equal(stripSuite(street), street));
  }
});

describe("buildQuery", () => {
  const LOUISVILLE = { city: "Louisville", state: "KY" };

  it("joins street, city, state and zip", () => {
    const row = { address: "100 W MAIN ST", city: "LOUISVILLE", state: "KY", zip: "40202" };
    assert.equal(buildQuery(row, LOUISVILLE), "100 W MAIN ST, LOUISVILLE, KY, 40202");
  });

  it("fills a missing city and state from the defaults", () => {
    assert.equal(
      buildQuery({ address: "100 W MAIN ST" }, LOUISVILLE),
      "100 W MAIN ST, Louisville, KY",
    );
  });

  it("skips parts it has no value for", () => {
    assert.equal(buildQuery({ address: "1 A ST", city: "BROOKS" }), "1 A ST, BROOKS");
  });
});

describe("cacheKey", () => {
  it("lowercases and collapses spaces", () =>
    assert.equal(cacheKey("  100 W  MAIN ST, Louisville "), "100 w main st, louisville"));
});

describe("isBuildingMatch", () => {
  it("accepts a house, a building, or a business at the address", () => {
    assert.ok(isBuildingMatch({ class: "place", type: "house" }));
    assert.ok(isBuildingMatch({ class: "building", type: "yes" }));
    assert.ok(isBuildingMatch({ class: "amenity", type: "fast_food" }));
    assert.ok(isBuildingMatch({ class: "shop", type: "convenience" }));
  });

  // The Bullitt bug: "1911 OLD PRESTON HWY" and "1679 OLD PRESTON HWY" both came back as
  // the road, so two places a mile apart got the same pin.
  it("rejects a road, a town or a zip code standing in for the address", () => {
    assert.ok(!isBuildingMatch({ class: "highway", type: "primary" }));
    assert.ok(!isBuildingMatch({ class: "highway", type: "residential" }));
    assert.ok(!isBuildingMatch({ class: "place", type: "town" }));
    assert.ok(!isBuildingMatch({ class: "place", type: "postcode" }));
    assert.ok(!isBuildingMatch({ class: "boundary", type: "administrative" }));
    assert.ok(!isBuildingMatch(null));
  });
});

describe("firstInside", () => {
  const inside = (r) => r.lon > 0;
  const at = (lon) => async () => ({ lon });

  it("returns the first result inside, skipping earlier ones outside", async () => {
    assert.deepEqual(await firstInside([at(-1), async () => null, at(2), at(3)], inside), {
      lon: 2,
    });
  });

  it("falls back to the first result found when none is inside", async () => {
    assert.deepEqual(await firstInside([async () => null, at(-1), at(-2)], inside), { lon: -1 });
  });

  it("is null when nothing matches, and a geocoder that throws counts as no match", async () => {
    const errors = [];
    const boom = async () => {
      throw new Error("down");
    };
    assert.equal(await firstInside([boom], inside, { onError: (e) => errors.push(e) }), null);
    assert.equal(errors.length, 1);
  });

  it("stops at the first inside result without calling the rest", async () => {
    let called = false;
    await firstInside([at(1), async () => ((called = true), null)], inside);
    assert.equal(called, false);
  });
});
