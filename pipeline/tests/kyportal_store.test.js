/**
 * tests/kyportal_store.test.js — storing a portal county (regions/kyportal/plan.js and
 * store.js). The places are the real Oldham rows in fixtures/kyportal_oldham.html; the
 * database is a stand-in (support/fakeSupa.js).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COUNTIES } from "../regions/kyportal/counties.js";
import { parsePortalPage } from "../regions/kyportal/parse.js";
import { checkShrink, contentSha256, inspectionKey, planLoad } from "../regions/kyportal/plan.js";
import { storeCounty } from "../regions/kyportal/store.js";
import { fakeSupa } from "./support/fakeSupa.js";

const PAGE = readFileSync(new URL("./fixtures/kyportal_oldham.html", import.meta.url), "utf8");
const { establishments } = parsePortalPage(PAGE, { idPrefix: "oldham-" });
const DAY = "2026-11-19";
const NOW = new Date("2026-11-19T09:15:00Z");
const nothingKnown = { ids: new Map(), inspections: new Map() };
// What the database holds after a first load: id (or result key) -> first_seen.
const knownAfter = (plan) => ({
  ids: new Map(plan.addedPlaces.map((p) => [p.id, p.first_seen])),
  inspections: new Map(plan.freshInspections.map((i) => [inspectionKey(i), i.first_seen])),
});

describe("contentSha256", () => {
  it("doesn't depend on the order of the places", () => {
    assert.equal(contentSha256([...establishments].reverse()), contentSha256(establishments));
  });

  it("changes when a result changes", () => {
    const changed = establishments.map((e, i) =>
      i === 0 ? { ...e, inspections: [{ content_hash: "new" }] } : e,
    );
    assert.notEqual(contentSha256(changed), contentSha256(establishments));
  });
});

describe("checkShrink", () => {
  it("stops when a county drops below half its last count", () => {
    assert.throws(
      () => checkShrink(100, { place_count: 336 }),
      /100 places, the last load had 336/,
    );
  });

  it("lets a normal change, or a first load, through", () => {
    checkShrink(330, { place_count: 336 });
    checkShrink(7, undefined);
  });
});

describe("planLoad", () => {
  it("adds every place and result on the first load", () => {
    const plan = planLoad(establishments, nothingKnown, "oldham", DAY);
    assert.equal(plan.addedPlaces.length, 7);
    assert.equal(plan.freshInspections.length, 10);
    assert.deepEqual([plan.keptPlaces, plan.keptInspections], [[], []]);
    assert.ok(plan.addedPlaces.every((p) => p.region === "oldham" && p.first_seen === DAY));
  });

  it("keeps the real inspection date and the grade", () => {
    const { freshInspections } = planLoad(establishments, nothingKnown, "oldham", DAY);
    const pizza = establishments.find((e) => e.name === "HOMETOWN PIZZA");
    const row = freshInspections.find((i) => i.establishment_id === pizza.id);
    assert.equal(row.inspection_date, "2026-11-09");
    assert.ok(freshInspections.some((i) => i.grade === "A"));
  });

  it("adds nothing on a second load of the same page", () => {
    const first = planLoad(establishments, nothingKnown, "oldham", DAY);
    const known = knownAfter(first);
    const again = planLoad(establishments, known, "oldham", "2026-11-20");
    assert.deepEqual([again.addedPlaces, again.freshInspections], [[], []]);
    assert.equal(again.keptInspections.length, 10);
    assert.ok(again.keptPlaces.every((p) => p.last_seen === "2026-11-20"));
  });

  // The 2026-11-13 Oldham load failed: kept rows went to an upsert without first_seen, and
  // Postgres rejects the NULL before it resolves the conflict.
  it("gives every kept row its stored first_seen, so the upsert can't write a NULL", () => {
    const first = planLoad(establishments, nothingKnown, "oldham", DAY);
    const again = planLoad(establishments, knownAfter(first), "oldham", "2026-11-20");
    for (const row of [...again.keptPlaces, ...again.keptInspections]) {
      assert.equal(row.first_seen, DAY);
      assert.equal(row.last_seen, "2026-11-20");
    }
  });

  it("adds a follow-up's score as a new result once it's posted", () => {
    const first = planLoad(establishments, nothingKnown, "oldham", DAY);
    const known = knownAfter(first);
    const scored = establishments.map((e) =>
      e.name === "APPLEBEE'S IHOP #75057"
        ? {
            ...e,
            inspections: e.inspections.map((i, n) =>
              n === 0 ? { ...i, score: 100, content_hash: "scored" } : i,
            ),
          }
        : e,
    );
    const { freshInspections } = planLoad(scored, known, "oldham", "2026-11-20");
    assert.deepEqual(
      freshInspections.map((i) => [i.kind, i.inspection_date, i.score]),
      [["follow_up", "2026-06-15", 100]],
    );
  });
});

describe("storeCounty", () => {
  const OLDHAM = COUNTIES.oldham;

  it("on the first load, writes places, results and the read, all tagged oldham", async () => {
    const { supa, calls, op } = fakeSupa();
    const out = await storeCounty(supa, OLDHAM, establishments, { day: DAY, now: NOW });
    assert.deepEqual(out, {
      unchanged: false,
      places: 7,
      newPlaces: 7,
      gonePlaces: 0,
      newInspections: 10,
    });
    const tables = new Set(calls.map((c) => c.table));
    assert.deepEqual(
      [...tables].sort(),
      ["portal_establishments", "portal_inspections", "portal_regions"],
      "no other county's tables",
    );
    for (const c of calls.filter((c) => ["select", "update"].includes(op(c)))) {
      if (c.table === "portal_regions" && op(c) === "select") continue;
      assert.ok(
        c.ops.some(([m, col, v]) => m === "eq" && col === "region" && v === "oldham"),
        `${op(c)} on ${c.table} is limited to Oldham`,
      );
    }
    const read = calls.find((c) => c.table === "portal_regions" && op(c) === "upsert");
    assert.deepEqual(
      [read.ops[0][1].county_number, read.ops[0][1].place_count, read.ops[0][1].last_checked_at],
      [93, 7, NOW.toISOString()],
    );
  });

  it("when nothing changed, only records that the portal answered", async () => {
    const sha = contentSha256(establishments);
    const { supa, calls, op } = fakeSupa((c) =>
      c.table === "portal_regions" && op(c) === "select"
        ? [{ content_sha256: sha, place_count: 7, last_changed_at: "2026-11-18T09:15:00Z" }]
        : [],
    );
    const out = await storeCounty(supa, OLDHAM, establishments, { day: DAY, now: NOW });
    assert.deepEqual(out, { unchanged: true, since: "2026-11-18T09:15:00Z" });
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1].ops[0], ["update", { last_checked_at: NOW.toISOString() }]);
  });

  it("writes nothing when the county shrank to under half", async () => {
    const { supa, calls, op } = fakeSupa((c) =>
      c.table === "portal_regions" ? [{ content_sha256: "old", place_count: 336 }] : [],
    );
    await assert.rejects(
      storeCounty(supa, OLDHAM, establishments, { day: DAY, now: NOW }),
      /7 places, the last load had 336/,
    );
    assert.ok(calls.every((c) => op(c) === "select"));
  });

  it("stops reading rather than loop on when a table is far bigger than expected", async () => {
    const page = Array.from({ length: 1000 }, (_, i) => ({ id: `oldham-${i}` }));
    const { supa, calls } = fakeSupa((c) => (c.table === "portal_establishments" ? page : []));
    await assert.rejects(
      storeCounty(supa, OLDHAM, establishments, { day: DAY, now: NOW }),
      /more than 20000 rows/,
    );
    assert.equal(calls.filter((c) => c.table === "portal_establishments").length, 20);
  });
});
