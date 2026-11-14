/**
 * tests/digest_render.test.js — what the weekly digest says for a week of mocked rows.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { groupWatchAreas, renderDigest, summarize, FAIL_SCORE } from "../digest/render.js";

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

// digest_watch_areas rows: the area's details and totals repeat on each of its places.
const areaRow = (area, place) => ({
  user_id: "u1",
  area_id: "home",
  label: "Home",
  center_address: "1 Main St, Louisville",
  radius_miles: 2,
  area_total: 0,
  area_failing: 0,
  place_rank: null,
  establishment_id: null,
  ...area,
  ...(place ? row(place) : {}),
});
const AREA_ROWS = [
  areaRow(
    { area_total: 12, area_failing: 1, place_rank: 1 },
    { establishment_id: "a", premise_name: "TACO <SHOP>", score: 78, violation_count: 4 },
  ),
  areaRow(
    { area_total: 12, area_failing: 1, place_rank: 2 },
    { establishment_id: "c", premise_name: "CAFE", score: 100 },
  ),
  areaRow({ area_id: "work", label: null, center_address: "500 W Jefferson St", radius_miles: 5 }),
  areaRow(
    { user_id: "u2", area_id: "gym", label: "Gym", area_total: 1, place_rank: 1 },
    { establishment_id: "z", premise_name: "SMOOTHIES", score: 96 },
  ),
];

describe("groupWatchAreas", () => {
  const byUser = groupWatchAreas(AREA_ROWS);

  it("groups places under each person's areas, keeping the totals", () => {
    assert.deepEqual([...byUser.keys()], ["u1", "u2"]);
    const [home, work] = byUser.get("u1");
    assert.deepEqual(
      [home.name, home.radius, home.total, home.failing, home.places.length],
      ["Home", 2, 12, 1, 2],
    );
    assert.deepEqual(
      home.places.map((p) => p.establishment_id),
      ["a", "c"],
    );
    assert.equal(work.name, "500 W Jefferson St"); // no label: the address
  });

  it("keeps an area with nothing inspected, with no places", () => {
    const work = byUser.get("u1")[1];
    assert.deepEqual([work.total, work.places], [0, []]);
  });

  it("is empty for no rows", () => {
    assert.equal(groupWatchAreas(null).size, 0);
  });
});

describe("renderDigest with watch areas", () => {
  const s = summarize(ROWS, { today: "2026-11-10" });
  const areas = groupWatchAreas(AREA_ROWS).get("u1");
  const { subject, html, text } = renderDigest(s, { areas });

  it("gives each watch area its own part, above the part everyone gets", () => {
    const home = html.indexOf("Your watch area · 2 mi");
    const work = html.indexOf("Your watch area · 5 mi");
    const everywhere = html.indexOf("Everywhere this week");
    assert.ok(home > 0 && work > home && everywhere > work);
    assert.match(html, /12 inspections this week, 1 failing/);
    assert.match(html, /and 10 more on the map/);
    assert.match(text, /Your watch area: Home \(2 mi\)\. 12 inspections this week, 1 failing/);
  });

  it("says so when an area had no inspections", () => {
    assert.match(html, /500 W Jefferson St/);
    assert.match(html, /No inspections here this week\./);
    assert.match(text, /Your watch area: 500 W Jefferson St \(5 mi\)\. No inspections here/);
  });

  it("leaves out other people's areas, and the heading when there are none", () => {
    assert.doesNotMatch(html, /Gym/);
    assert.doesNotMatch(renderDigest(s).html, /Everywhere this week|Your watch area/);
  });

  it("marks a test send in the subject only", () => {
    assert.equal(subject, "4 inspections this week, 2 failing · Louisville Food Safe");
    assert.match(renderDigest(s, { test: true }).subject, /^\[Test\] 4 inspections/);
  });
});
