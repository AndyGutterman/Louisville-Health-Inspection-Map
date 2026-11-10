/**
 * tests/geocode.test.js — the pure helpers in lib/geocode.js (no network).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildQuery, cacheKey, stripSuite } from "../lib/geocode.js";

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
