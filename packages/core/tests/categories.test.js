/**
 * tests/categories.test.js — the facility categories the site and the pipeline share.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CATEGORY_KEYS,
  CATEGORY_SPECS,
  categoryPairs,
  classifyCategory,
} from "@lfs/core/categories.js";

describe("categories", () => {
  it("gives every (facility type, subtype) pair to exactly one category", () => {
    const pairs = categoryPairs();
    assert.equal(new Set(pairs).size, pairs.length);
    assert.equal(pairs.length, 21);
  });

  it("files a pair under the category that lists it", () => {
    for (const key of CATEGORY_KEYS) {
      for (const { ft, st } of CATEGORY_SPECS[key].subs) {
        assert.equal(classifyCategory(ft, st), key, `${ft}:${st}`);
      }
    }
  });

  it("files anything it doesn't know, or with no type, under unknown", () => {
    assert.equal(classifyCategory(999, 1), "unknown");
    assert.equal(classifyCategory(null, null), "unknown");
  });

  it("lists pairs as type:subtype, for the categories asked for", () => {
    assert.deepEqual(categoryPairs(["restaurants", "schools"]), ["605:11", "605:33"]);
  });
});
