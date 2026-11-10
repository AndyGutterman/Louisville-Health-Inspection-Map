/**
 * tests/digest_render.test.js — what the weekly digest says for a week of mocked rows.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderDigest, summarize, FAIL_SCORE } from "../digest/render.js";

const row = (over) => ({
  establishment_id: "1",
  premise_name: "PLACE",
  address: "1 MAIN ST",
  score: 95,
  grade: "A",
  inspection_date: "2026-11-09",
  violation_count: 0,
  region: "jefferson",
  posted_date: null,
  ...over,
});

const ROWS = [
  row({
    establishment_id: "a",
    premise_name: "TACO <SHOP>",
    score: 78,
    grade: "A",
    violation_count: 4,
  }),
  row({ establishment_id: "b", premise_name: "DINER", score: 92, grade: "C" }),
  row({ establishment_id: "c", premise_name: "CAFE", score: 100 }),
  row({
    establishment_id: "d",
    premise_name: "OLD NEWS",
    score: 60,
    inspection_date: "2026-10-20",
  }),
  row({
    establishment_id: "bullitt-x",
    premise_name: "SHEPHERDSVILLE GRILL",
    score: 88,
    grade: null,
    inspection_date: null,
    posted_date: "2026-11-08",
    region: "bullitt",
    violation_count: 2,
  }),
];

describe("summarize", () => {
  const s = summarize(ROWS, { today: "2026-11-10", days: 7 });

  it("keeps the last 7 days only, counting Bullitt by posted date", () => {
    assert.equal(s.since, "2026-11-04");
    assert.equal(s.total, 4);
    assert.deepEqual(s.byRegion, { jefferson: 3, bullitt: 1 });
  });

  it("failing = under the line or a C placard, worst first", () => {
    assert.deepEqual(
      s.failing.map((r) => r.establishment_id),
      ["a", "b"],
    );
    assert.ok(FAIL_SCORE > 78);
  });

  it("lists perfect scores", () => {
    assert.deepEqual(
      s.perfect.map((r) => r.establishment_id),
      ["c"],
    );
  });
});

describe("renderDigest", () => {
  const s = summarize(ROWS, { today: "2026-11-10" });
  const { subject, html, text } = renderDigest(s, {
    unsubscribeUrl: "https://example.test/?unsubscribe=tok",
  });

  it("subject has the counts", () => {
    assert.equal(subject, "4 inspections this week, 2 failing · Louisville Food Safe");
  });

  it("escapes names and links each place", () => {
    assert.match(html, /TACO &lt;SHOP&gt;/);
    assert.doesNotMatch(html, /<SHOP>/);
    assert.match(html, /\?eid=a"/);
  });

  it("has the unsubscribe link in both parts, and none in a preview", () => {
    assert.match(html, /unsubscribe=tok/);
    assert.match(text, /Unsubscribe: https:\/\/example\.test/);
    const preview = renderDigest(s);
    assert.doesNotMatch(preview.html, /Unsubscribe/);
  });

  it("says so when nothing failed", () => {
    const quiet = renderDigest(summarize([row({ score: 97 })], { today: "2026-11-10" }));
    assert.match(quiet.html, /Nothing scored under 85/);
    assert.match(quiet.text, /none/);
  });
});
