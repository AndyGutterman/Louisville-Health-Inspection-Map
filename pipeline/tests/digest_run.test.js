/**
 * tests/digest_run.test.js — sending an email job (digest/run.js) with a stand-in
 * database and a stand-in mailer: who gets it, what their copy says, and what a second
 * run of the same job does.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildEmail, runJob, scrub } from "../digest/run.js";

const TODAY = "2026-11-10";
const ROWS = [
  {
    establishment_id: "a",
    premise_name: "TACO SHOP",
    address: "1 MAIN ST",
    score: 78,
    grade: "A",
    inspection_date: "2026-11-09",
    violation_count: 4,
    region: "jefferson",
    posted_date: null,
  },
];
const AREA = { id: "x", name: "Home", radius: 2, total: 1, failing: 1, places: ROWS };
const JANE = { id: "u-jane", email: "jane@example.com", token: "tok-jane" };
const SAM = { id: "u-sam", email: "sam@example.com", token: "tok-sam" };

// A database with two subscribers; Jane has a watch area, Sam a saved place that was
// inspected (Jane can be given it too). Records what was asked of it.
function fakeStore({ delivered = [], janeSaves = false } = {}) {
  const calls = { watchAreas: [], savedPlaces: [], recorded: [], weekRows: 0 };
  const saved = { total: 2, places: ROWS };
  return {
    calls,
    weekRows: async () => (calls.weekRows++, ROWS),
    subscribers: async () => [JANE, SAM],
    accounts: async (emails) =>
      emails.map(
        (email) =>
          [JANE, SAM].find((p) => p.email === email.toLowerCase()) ?? {
            id: null,
            email,
            token: null,
          },
      ),
    watchAreas: async (days, ids) => {
      calls.watchAreas.push({ days, ids });
      return new Map(ids == null || ids.includes(JANE.id) ? [[JANE.id, [AREA]]] : []);
    },
    savedPlaces: async (days, ids) => {
      calls.savedPlaces.push({ days, ids });
      const people = [SAM.id, ...(janeSaves ? [JANE.id] : [])];
      return new Map(
        people.filter((id) => ids == null || ids.includes(id)).map((id) => [id, saved]),
      );
    },
    delivered: async () => new Set(delivered),
    recordDelivery: async (jobId, r, status, error) => {
      calls.recorded.push({ jobId, email: r.email, status, error });
    },
  };
}

// A mailer that keeps what it was given and fails for the addresses in `bad`.
function fakeMailer(bad = []) {
  const outbox = [];
  const send = async (email) => {
    if (bad.includes(email.to)) throw new Error(`550 no such user ${email.to}`);
    outbox.push(email);
  };
  return { outbox, send };
}

const digest = (over) => ({ kind: "digest", audience: "subscribers", days: 7, ...over });

describe("runJob", () => {
  it("sends every subscriber their own digest and logs each delivery", async () => {
    const store = fakeStore();
    const { outbox, send } = fakeMailer();
    const r = await runJob(digest({ id: "job-1" }), { store, send, today: TODAY });

    assert.deepEqual(r, { total: 2, sent: 2, failed: 0, skipped: 0 });
    assert.deepEqual(
      outbox.map((e) => e.to),
      [JANE.email, SAM.email],
    );
    // Jane's copy has her watch area; Sam's doesn't. One read for everyone's areas.
    assert.match(outbox[0].html, /Your watch area/);
    assert.doesNotMatch(outbox[1].html, /Your watch area/);
    assert.deepEqual(store.calls.watchAreas, [{ days: 7, ids: null }]);
    // Each carries its own unsubscribe link.
    assert.match(outbox[0].unsubscribeUrl, /unsubscribe=tok-jane$/);
    assert.match(outbox[1].html, /unsubscribe=tok-sam/);
    assert.deepEqual(
      store.calls.recorded.map((d) => [d.jobId, d.email, d.status]),
      [
        ["job-1", JANE.email, "sent"],
        ["job-1", SAM.email, "sent"],
      ],
    );
  });

  it("puts each subscriber's saved places in their copy, read once for everyone", async () => {
    const store = fakeStore();
    const { outbox, send } = fakeMailer();
    await runJob(digest({ id: "job-1" }), { store, send, today: TODAY });

    assert.deepEqual(store.calls.savedPlaces, [{ days: 7, ids: null }]);
    assert.doesNotMatch(outbox[0].html, /Your saved places/); // Jane saved nothing
    assert.match(outbox[1].html, /Your saved places/);
    assert.match(outbox[1].html, /1 of your 2 saved places was inspected this week/);
  });

  it("names a place once when it's both saved and in a watch area", async () => {
    const store = fakeStore({ janeSaves: true });
    const { outbox, send } = fakeMailer();
    await runJob(digest({ id: "job-1" }), { store, send, today: TODAY });

    const jane = outbox[0];
    assert.equal(jane.html.split("TACO SHOP").length - 1, 1);
    assert.equal(jane.text.split("TACO SHOP").length - 1, 1);
    assert.match(jane.html, /1 inspection this week, 1 failing \(1 shown above\)/);
  });

  it("a second run of the same job skips everyone already delivered", async () => {
    const store = fakeStore({ delivered: [JANE.email] });
    const { outbox, send } = fakeMailer();
    const r = await runJob(digest({ id: "job-1" }), { store, send, today: TODAY });

    assert.deepEqual(r, { total: 2, sent: 1, failed: 0, skipped: 1 });
    assert.deepEqual(
      outbox.map((e) => e.to),
      [SAM.email],
    );
  });

  it("carries on past an address that fails, and never logs the address", async () => {
    const store = fakeStore();
    const { outbox, send } = fakeMailer([JANE.email]);
    const lines = [];
    const r = await runJob(digest({ id: "job-1" }), {
      store,
      send,
      today: TODAY,
      log: (l) => lines.push(l),
    });

    assert.deepEqual(r, { total: 2, sent: 1, failed: 1, skipped: 0 });
    assert.equal(outbox.length, 1);
    assert.ok(!lines.join("\n").includes(JANE.email)); // the workflow's log is public
    assert.match(lines.join("\n"), /recipient 1 of 2: 550 no such user <address>/);
    // The admin-only delivery log keeps the full error.
    assert.equal(store.calls.recorded[0].status, "failed");
    assert.match(store.calls.recorded[0].error, /jane@example\.com/);
  });

  it("a list of addresses reads only those accounts' watch areas", async () => {
    const store = fakeStore();
    const { outbox, send } = fakeMailer();
    const job = digest({
      audience: "emails",
      to_emails: [JANE.email, "new@example.com"],
      test: true,
    });
    const r = await runJob(job, { store, send, today: TODAY });

    assert.equal(r.sent, 2);
    assert.deepEqual(store.calls.watchAreas, [{ days: 7, ids: [JANE.id] }]);
    assert.match(outbox[0].subject, /^\[Test\] /);
    // An address without an account: no watch areas, no unsubscribe link.
    assert.equal(outbox[1].unsubscribeUrl, null);
    assert.doesNotMatch(outbox[1].html, /Unsubscribe/);
    // No job id (a script run on a database without the outbox): nothing to log.
    assert.equal(store.calls.recorded.length, 0);
  });

  it("with no accounts among the addresses, watch areas aren't read at all", async () => {
    const store = fakeStore();
    const { send } = fakeMailer();
    await runJob(digest({ audience: "emails", to_emails: ["new@example.com"] }), {
      store,
      send,
      today: TODAY,
    });
    assert.deepEqual(store.calls.watchAreas, []);
  });

  it("someone's digest sent to the owner shows their watch areas and no unsubscribe link", async () => {
    const store = fakeStore();
    const { outbox, send } = fakeMailer();
    const job = digest({
      audience: "emails",
      to_emails: ["owner@example.com"],
      as_user: JANE.id,
      test: true,
    });
    await runJob(job, { store, send, today: TODAY });

    assert.deepEqual(store.calls.watchAreas, [{ days: 7, ids: [JANE.id] }]);
    assert.equal(outbox[0].to, "owner@example.com");
    assert.match(outbox[0].html, /Your watch area/);
    assert.equal(outbox[0].unsubscribeUrl, null);
  });

  it("a custom email is the typed message, with each subscriber's unsubscribe link", async () => {
    const store = fakeStore();
    const { outbox, send } = fakeMailer();
    const job = {
      kind: "custom",
      audience: "subscribers",
      subject: "New county",
      body: "Oldham County is on the map.",
      with_button: false,
    };
    const r = await runJob(job, { store, send, today: TODAY });

    assert.equal(r.sent, 2);
    assert.equal(outbox[0].subject, "New county");
    assert.match(outbox[0].html, /Oldham County is on the map\./);
    assert.match(outbox[0].html, /unsubscribe=tok-jane/);
    assert.doesNotMatch(outbox[0].html, /Open the map/);
    // A custom email needs neither the week's inspections nor anyone's watch areas.
    assert.equal(store.calls.weekRows, 0);
    assert.deepEqual(store.calls.watchAreas, []);
  });

  it("refuses a job it doesn't understand before sending anything", async () => {
    const store = fakeStore();
    const { outbox, send } = fakeMailer();
    await assert.rejects(
      runJob({ kind: "newsletter", audience: "subscribers" }, { store, send, today: TODAY }),
      /Unknown kind/,
    );
    await assert.rejects(
      runJob({ kind: "digest", audience: "the world" }, { store, send, today: TODAY }),
      /Unknown audience/,
    );
    assert.equal(outbox.length, 0);
  });
});

describe("buildEmail", () => {
  it("gives the preview the same copy the send would", async () => {
    const store = fakeStore();
    const { to, renderFor, summary } = await buildEmail(digest(), { store, today: TODAY });
    assert.equal(to.length, 2);
    assert.equal(summary.total, 1);
    assert.match(renderFor(JANE).html, /Your watch area/);
  });
});

describe("scrub", () => {
  it("takes the address out of an error message", () => {
    assert.equal(
      scrub("550 <a@b.co> unknown a@b.co", "a@b.co"),
      "550 <<address>> unknown <address>",
    );
    assert.equal(scrub(undefined, "a@b.co"), "");
  });
});
