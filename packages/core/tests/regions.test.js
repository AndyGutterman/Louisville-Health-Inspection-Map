/**
 * tests/regions.test.js — the counties' ids and names.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { COUNTIES, countyName, countyOfId } from "@lfs/core/regions.js";

describe("counties", () => {
  it("names a county by its id, and gives an unknown id back", () => {
    assert.equal(countyName("jefferson"), "Jefferson County");
    assert.equal(countyName("oldham"), "Oldham County");
    assert.equal(countyName("shelby"), "shelby");
  });

  it("keys each county by its own id", () => {
    for (const [key, county] of Object.entries(COUNTIES)) assert.equal(county.id, key);
  });

  it("reads the county from an establishment id's prefix; a bare id is Louisville's", () => {
    assert.equal(countyOfId("bullitt-abc123"), "bullitt");
    assert.equal(countyOfId("oldham-9"), "oldham");
    assert.equal(countyOfId("100234"), "jefferson");
    assert.equal(countyOfId(100234), "jefferson");
    assert.equal(countyOfId(null), "jefferson");
    assert.equal(countyOfId("jefferson-1"), "jefferson");
  });
});
