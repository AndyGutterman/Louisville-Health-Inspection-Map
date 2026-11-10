/**
 * tests/paging.test.js — readAllPages keeps asking until a page comes back short.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readAllPages, selectAll } from "../lib/paging.js";

const rows = (n) => Array.from({ length: n }, (_, i) => ({ id: i }));
const pager = (all, calls) => async (from, to) => {
  calls.push([from, to]);
  return { data: all.slice(from, to + 1), error: null };
};

describe("readAllPages", () => {
  it("reads three pages for 2,500 rows, in order", async () => {
    const calls = [];
    const got = await readAllPages(pager(rows(2500), calls));
    assert.equal(got.length, 2500);
    assert.deepEqual(
      got.map((r) => r.id),
      rows(2500).map((r) => r.id),
    );
    assert.deepEqual(calls, [
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("asks once more after an exactly full page", async () => {
    const calls = [];
    assert.equal((await readAllPages(pager(rows(1000), calls))).length, 1000);
    assert.equal(calls.length, 2);
  });

  it("returns [] for an empty table", async () => {
    assert.deepEqual(await readAllPages(pager([], [])), []);
  });

  it("rejects on the first error", async () => {
    await assert.rejects(
      () => readAllPages(async () => ({ data: null, error: { message: "boom" } })),
      /boom/,
    );
  });
});

describe("selectAll", () => {
  it("orders and ranges the query", async () => {
    const log = [];
    const chain = {
      select: (c) => (log.push(["select", c]), chain),
      order: (c) => (log.push(["order", c]), chain),
      range: async (a, b) => (log.push(["range", a, b]), { data: rows(5), error: null }),
    };
    const supa = { from: (t) => (log.push(["from", t]), chain) };
    assert.equal(
      (await selectAll(supa, "facilities", "establishment_id", { order: "establishment_id" }))
        .length,
      5,
    );
    assert.deepEqual(log, [
      ["from", "facilities"],
      ["select", "establishment_id"],
      ["order", "establishment_id"],
      ["range", 0, 999],
    ]);
  });
});
