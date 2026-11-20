/**
 * tests/email_digest.test.js — what the weekly digest says for a week of mocked rows.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  groupSavedPlaces,
  groupWatchAreas,
  oncePerEmail,
  renderDigest,
  summarize,
  FAIL_SCORE,
} from "@lfs/core/email/digest.js";

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

  it("says why you're getting it, in your language, only with an unsubscribe link", () => {
    assert.match(html, /because you subscribed to the Louisville Food Safe weekly digest/);
    const es = renderDigest(s, {
      unsubscribeUrl: "https://example.test/?unsubscribe=tok",
      lang: "es",
    });
    assert.match(es.html, /Recibes este correo porque te suscribiste/);
    assert.doesNotMatch(renderDigest(s).html, /because you subscribed/);
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

describe("groupSavedPlaces", () => {
  it("gives each person their count of saved places and the ones inspected", () => {
    const byUser = groupSavedPlaces([
      { user_id: "u1", saved_total: 3, ...row({ establishment_id: "a" }) },
      { user_id: "u1", saved_total: 3, ...row({ establishment_id: "b" }) },
      { user_id: "u2", saved_total: 2, establishment_id: null },
    ]);
    assert.equal(byUser.get("u1")[0].total, 3);
    assert.deepEqual(
      byUser.get("u1")[0].places.map((r) => r.establishment_id),
      ["a", "b"],
    );
    assert.deepEqual(byUser.get("u2"), [{ id: null, name: null, total: 2, places: [] }]);
  });
});

describe("oncePerEmail", () => {
  const s = summarize(ROWS, { today: "2026-11-10" });
  const saved = [{ id: null, name: null, total: 3, places: [ROWS[0]] }]; // TACO, failing
  const area = (id, ids) => ({
    id,
    name: id,
    radius: 1,
    total: ids.length,
    failing: 0,
    places: ids.map((e) => row({ establishment_id: e })),
  });

  it("leaves a saved place out of the watch areas, and counts it as shown above", () => {
    const mine = oncePerEmail({ saved, areas: [area("home", ["a", "x", "c"])] });
    assert.deepEqual(
      mine.areas[0].places.map((r) => r.establishment_id),
      ["x", "c"],
    );
    assert.equal(mine.areas[0].above, 1);
  });

  it("lists a place in two watch areas only in the first", () => {
    const mine = oncePerEmail({ areas: [area("home", ["x"]), area("work", ["x", "y"])] });
    assert.deepEqual(
      mine.areas[1].places.map((r) => r.establishment_id),
      ["y"],
    );
    assert.equal(mine.areas[1].above, 1);
  });

  it("drops what the personal parts showed from the shared lists", () => {
    const mine = oncePerEmail({
      saved,
      areas: [area("home", ["c"])],
      failing: s.failing,
      perfect: s.perfect,
    });
    assert.deepEqual(
      mine.failing.map((r) => r.establishment_id),
      ["b"],
    );
    assert.equal(mine.failingAbove, 1);
    assert.deepEqual(mine.perfect, []);
  });

  it("changes nothing for someone with no saved places or areas", () => {
    const mine = oncePerEmail({ failing: s.failing, perfect: s.perfect });
    assert.equal(mine.failing.length, s.failing.length);
    assert.equal(mine.failingAbove, 0);
  });
});

describe("renderDigest with saved places", () => {
  const s = summarize(ROWS, { today: "2026-11-10" });
  const times = (text, needle) => text.split(needle).length - 1;

  it("puts the saved places first, and names each place once", () => {
    const { html, text } = renderDigest(s, {
      saved: [{ id: null, name: null, total: 3, places: [ROWS[0]] }],
    });
    assert.match(html, /Your saved places/);
    assert.match(html, /1 of your 3 saved places was inspected this week/);
    assert.ok(html.indexOf("Your saved places") < html.indexOf("Everywhere this week"));
    assert.equal(times(html, "TACO &lt;SHOP&gt;"), 1);
    assert.equal(times(text, "TACO <SHOP>"), 1);
    assert.match(html, /a C placard \(1 shown above\)/);
  });

  it("says so when none of them was inspected", () => {
    const { html, text } = renderDigest(s, {
      saved: [{ id: null, name: null, total: 2, places: [] }],
    });
    assert.match(html, /None of your 2 saved places were inspected this week/);
    assert.match(text, /Your saved places: None of your 2 saved places/);
  });

  it("says the failing list is all above when every failing place is", () => {
    const { html } = renderDigest(s, {
      saved: [{ id: null, name: null, total: 2, places: [ROWS[0], ROWS[1]] }],
    });
    assert.match(html, /Only the 2 places shown above\./);
  });

  it("has no saved part for someone with no saved places", () => {
    const { html } = renderDigest(s, { saved: [{ id: null, name: null, total: 0, places: [] }] });
    assert.doesNotMatch(html, /Your saved places/);
    assert.doesNotMatch(html, /Everywhere this week/);
  });

  it("keeps the subject's counts whole", () => {
    const plain = renderDigest(s).subject;
    const mine = renderDigest(s, {
      saved: [{ id: null, name: null, total: 3, places: [ROWS[0]] }],
    }).subject;
    assert.equal(mine, plain);
  });
});

describe("saved lists (ready for several per account)", () => {
  const s = summarize(ROWS, { today: "2026-11-10" });

  it("groups rows by list, keeping each list's name and count", () => {
    const byUser = groupSavedPlaces([
      {
        user_id: "u1",
        list_id: "l1",
        list_name: "Date night",
        saved_total: 4,
        ...row({ establishment_id: "a" }),
      },
      { user_id: "u1", list_id: "l2", list_name: " Kids ", saved_total: 2, establishment_id: null },
    ]);
    const [date, kids] = byUser.get("u1");
    assert.deepEqual([date.name, date.total, date.places.length], ["Date night", 4, 1]);
    assert.deepEqual([kids.name, kids.total, kids.places.length], ["Kids", 2, 0]);
  });

  it("gives a named list its own part, and names a place in two lists once", () => {
    const lists = [
      { id: "l1", name: "Date night", total: 4, places: [ROWS[0]] },
      { id: "l2", name: "Kids", total: 2, places: [ROWS[0], ROWS[2]] },
    ];
    const { html, text } = renderDigest(s, { saved: lists });
    assert.match(html, /Your list/);
    assert.match(html, /Date night/);
    assert.match(html, /1 of 4 places in this list was inspected this week\./);
    assert.match(html, /2 of 2 places in this list were inspected this week\. \(1 shown above\)/);
    assert.equal(html.split("TACO &lt;SHOP&gt;").length - 1, 1);
    assert.match(text, /Your list: Kids\. 2 of 2 places in this list/);
  });
});
