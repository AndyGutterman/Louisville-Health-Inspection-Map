/**
 * tests/grading.test.js — the one score scale: 95 and up, 85 to 94, under 85.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FAIL_SCORE, TOP_SCORE, isFailing, scoreBand } from "@lfs/core/grading.js";

describe("scoreBand", () => {
  it("is ok from 95, warn from 85, bad below", () => {
    assert.equal(scoreBand(100), "ok");
    assert.equal(scoreBand(TOP_SCORE), "ok");
    assert.equal(scoreBand(94), "warn");
    assert.equal(scoreBand(FAIL_SCORE), "warn");
    assert.equal(scoreBand(84), "bad");
    assert.equal(scoreBand(1), "bad");
  });

  it("is na when there is no score, which the data writes as null or 0", () => {
    for (const none of [null, undefined, 0, "", "n/a", NaN, -5]) {
      assert.equal(scoreBand(none), "na", String(none));
    }
  });

  it("reads a score that arrives as text", () => {
    assert.equal(scoreBand("96"), "ok");
    assert.equal(scoreBand("84"), "bad");
  });
});

describe("isFailing", () => {
  it("is a C placard or a score under 85", () => {
    assert.ok(isFailing({ score: 84, grade: "A" }));
    assert.ok(isFailing({ score: 92, grade: "C" }));
    assert.ok(isFailing({ score: 92, grade: "c" }));
    assert.ok(!isFailing({ score: 85, grade: "A" }));
    assert.ok(!isFailing({ score: 100, grade: null }));
  });

  it("doesn't call a place with no score failing", () => {
    assert.ok(!isFailing({ score: null, grade: null }));
    assert.ok(!isFailing({}));
  });
});
