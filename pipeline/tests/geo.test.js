/**
 * tests/geo.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bbox, containsPoint } from "../lib/geo.js";

const fc = (geometry) => ({ type: "FeatureCollection", features: [{ type: "Feature", geometry }] });
const square = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
  [0, 0],
];
const hole = [
  [4, 4],
  [6, 4],
  [6, 6],
  [4, 6],
  [4, 4],
];

describe("containsPoint", () => {
  it("finds points inside and outside a polygon", () => {
    const g = fc({ type: "Polygon", coordinates: [square] });
    assert.equal(containsPoint(g, [5, 5]), true);
    assert.equal(containsPoint(g, [11, 5]), false);
  });

  it("treats a hole as outside", () => {
    const g = fc({ type: "Polygon", coordinates: [square, hole] });
    assert.equal(containsPoint(g, [5, 5]), false);
    assert.equal(containsPoint(g, [2, 2]), true);
  });

  it("checks every part of a MultiPolygon", () => {
    const far = square.map(([x, y]) => [x + 20, y]);
    const g = fc({ type: "MultiPolygon", coordinates: [[square], [far]] });
    assert.equal(containsPoint(g, [25, 5]), true);
    assert.equal(containsPoint(g, [15, 5]), false);
  });

  it("puts Shepherdsville in Bullitt County and downtown Louisville outside it", () => {
    const bullitt = JSON.parse(
      readFileSync(
        new URL("../../apps/web/public/regions/bullitt.geojson", import.meta.url),
        "utf8",
      ),
    );
    assert.equal(containsPoint(bullitt, [-85.7158, 37.9884]), true); // Shepherdsville
    assert.equal(containsPoint(bullitt, [-85.7585, 38.2527]), false); // downtown Louisville
  });
});

describe("bbox", () => {
  it("spans every coordinate", () =>
    assert.deepEqual(bbox(fc({ type: "Polygon", coordinates: [square] })), [0, 0, 10, 10]));
});
