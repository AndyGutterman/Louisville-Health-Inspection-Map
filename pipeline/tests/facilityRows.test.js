/**
 * tests/facilityRows.test.js — the rows overlay_geometry.js writes (lib/facilityRows.js).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { batchesByKeys, normId, overlayRow } from "../lib/facilityRows.js";

const RECORD = {
  EstablishmentID: "1,234",
  EstablishmentName: "TACO SHOP",
  Address: "12 MAIN ST",
  City: "LOUISVILLE",
  State: "KY",
  Zip: 40202,
};

describe("overlayRow", () => {
  it("writes a location only as geom (lon and lat are generated from it)", () => {
    const row = overlayRow({ ...RECORD, _lon: -85.75, _lat: 38.25 });
    assert.equal(row.establishment_id, "1234");
    assert.equal(row.zip, "40202");
    assert.equal(row.loc_source, "legacy");
    assert.equal(row.geom, "SRID=4326;POINT(-85.75 38.25)");
    assert.equal("lon" in row || "lat" in row, false);
  });

  it("has no geom key at all for a record without a point", () =>
    assert.equal("geom" in overlayRow(RECORD), false));

  it("never sends geom or loc_source for a place pinned or hidden by hand", () => {
    const row = overlayRow({ ...RECORD, _lon: -85.75, _lat: 38.25 }, new Set(["1234"]));
    assert.equal("geom" in row || "loc_source" in row, false);
    assert.equal(row.name, "TACO SHOP", "name and address still refresh");
  });

  it("skips a record without a usable id", () => {
    assert.equal(overlayRow({ ...RECORD, EstablishmentID: " " }), null);
    assert.equal(normId("x"), null);
  });
});

describe("batchesByKeys", () => {
  it("keeps rows with and without a point in separate batches, so none gets geom: null", () => {
    const withPoint = overlayRow({ ...RECORD, _lon: -85.7, _lat: 38.2 });
    const without = overlayRow({ ...RECORD, EstablishmentID: "2" });
    const byHand = overlayRow({ ...RECORD, EstablishmentID: "3" }, new Set(["3"]));
    const batches = batchesByKeys(
      [withPoint, without, byHand, { ...without, establishment_id: "4" }],
      500,
    );
    assert.equal(batches.length, 3);
    for (const batch of batches) {
      const keys = Object.keys(batch[0]).sort().join();
      assert.ok(batch.every((r) => Object.keys(r).sort().join() === keys));
    }
  });

  it("splits a group into batches of the given size", () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: i }));
    assert.deepEqual(
      batchesByKeys(rows, 2).map((b) => b.length),
      [2, 2, 1],
    );
  });
});
