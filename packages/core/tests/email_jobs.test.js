/**
 * tests/email_jobs.test.js — the rules for an email job: what can be queued, when a job
 * is too old to send, and how the admin page words it.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  LIMITS,
  canRetry,
  checkJob,
  describeJob,
  isActive,
  isEmail,
  isExpired,
  isStuck,
  outcome,
  parseEmails,
  statusLabel,
} from "@lfs/core/email/jobs.js";

const NOW = Date.parse("2026-11-10T12:00:00Z");
const ago = (minutes) => new Date(NOW - minutes * 60000).toISOString();

describe("parseEmails", () => {
  it("splits on commas, semicolons, spaces and new lines, each address once", () => {
    const { emails, invalid } = parseEmails("a@x.com, b@y.org;c@z.net\nA@X.com  ");
    assert.deepEqual(emails, ["a@x.com", "b@y.org", "c@z.net"]);
    assert.deepEqual(invalid, []);
  });

  it("reports what isn't an address", () => {
    const { emails, invalid } = parseEmails("a@x.com, jane, @nope, x@y");
    assert.deepEqual(emails, ["a@x.com"]);
    assert.deepEqual(invalid, ["jane", "@nope", "x@y"]);
  });

  it("is empty for nothing", () => {
    assert.deepEqual(parseEmails(""), { emails: [], invalid: [] });
    assert.deepEqual(parseEmails(null), { emails: [], invalid: [] });
  });
});

describe("isEmail", () => {
  it("wants one @ and a dot after it", () => {
    assert.ok(isEmail("jane.doe+tag@example.co.uk"));
    for (const bad of ["", "jane", "a@b", "a b@c.com", "a@b@c.com", "<a@b.com>"]) {
      assert.ok(!isEmail(bad), bad);
    }
  });
});

describe("checkJob", () => {
  const digest = (over) => ({
    kind: "digest",
    audience: "emails",
    to_emails: ["a@x.com"],
    ...over,
  });
  const custom = (over) => ({
    kind: "custom",
    audience: "subscribers",
    to_emails: null,
    subject: "Hi",
    body: "Hello",
    ...over,
  });

  it("passes a test digest and a message to every subscriber", () => {
    assert.equal(checkJob(digest()), null);
    assert.equal(checkJob(digest({ days: 14, as_user: "u1" })), null);
    assert.equal(checkJob(custom()), null);
  });

  it("wants addresses for a list, real ones, and not too many", () => {
    assert.match(checkJob(digest({ to_emails: [] })), /at least one address/);
    assert.match(checkJob(digest({ to_emails: ["a@x.com", "nope"] })), /"nope" isn't an email/);
    const many = Array.from({ length: LIMITS.emails + 1 }, (_, i) => `a${i}@x.com`);
    assert.match(checkJob(digest({ to_emails: many })), /20 addresses at most/);
  });

  it("keeps an email to every subscriber each person's own", () => {
    assert.match(checkJob(custom({ to_emails: ["a@x.com"] })), /no address list/);
    assert.match(
      checkJob(digest({ audience: "subscribers", to_emails: null, as_user: "u1" })),
      /each person's own/,
    );
  });

  it("wants a subject and a message for a custom email, within the limits", () => {
    assert.match(checkJob(custom({ subject: "  " })), /Add a subject/);
    assert.match(checkJob(custom({ body: "" })), /Write a message/);
    assert.match(checkJob(custom({ subject: "x".repeat(LIMITS.subject + 1) })), /subject is over/);
    assert.match(checkJob(custom({ body: "x".repeat(LIMITS.body + 1) })), /message is over/);
  });

  it("keeps the digest's window between 1 and 30 days", () => {
    assert.equal(checkJob(digest({ days: 30 })), null);
    assert.match(checkJob(digest({ days: 0 })), /1 to 30 days/);
    assert.match(checkJob(digest({ days: 31 })), /1 to 30 days/);
    assert.match(checkJob(digest({ days: 2.5 })), /1 to 30 days/);
  });

  it("refuses kinds and audiences it doesn't know", () => {
    assert.match(checkJob(digest({ kind: "newsletter" })), /Unknown kind/);
    assert.match(checkJob(digest({ audience: "world" })), /Unknown audience/);
  });
});

describe("a job's age", () => {
  it("expires a job queued more than a day ago, so a stale send never goes out late", () => {
    assert.ok(!isExpired({ status: "queued", queued_at: ago(60) }, NOW));
    assert.ok(isExpired({ status: "queued", queued_at: ago(24 * 60 + 1) }, NOW));
    assert.ok(!isExpired({ status: "sent", queued_at: ago(9999) }, NOW));
  });

  it("calls a job stalled when it has been sending for over 15 minutes", () => {
    assert.ok(!isStuck({ status: "sending", started_at: ago(5) }, NOW));
    assert.ok(isStuck({ status: "sending", started_at: ago(16) }, NOW));
    assert.ok(!isStuck({ status: "sent", started_at: ago(999) }, NOW));
    assert.equal(statusLabel({ status: "sending", started_at: ago(16) }, NOW), "Stalled");
    assert.equal(statusLabel({ status: "sending", started_at: ago(1) }, NOW), "Sending");
    assert.equal(statusLabel({ status: "partial" }, NOW), "Partly sent");
  });

  it("is active while queued or sending, which is when the page keeps checking", () => {
    assert.ok(isActive({ status: "queued", queued_at: ago(1) }, NOW));
    assert.ok(isActive({ status: "sending", started_at: ago(1) }, NOW));
    assert.ok(!isActive({ status: "sending", started_at: ago(30) }, NOW));
    assert.ok(!isActive({ status: "sent" }, NOW));
  });

  it("offers Send again for what didn't finish, never for what did or is under way", () => {
    for (const status of ["failed", "partial", "expired", "cancelled"]) {
      assert.ok(canRetry({ status }, NOW), status);
    }
    assert.ok(canRetry({ status: "sending", started_at: ago(20) }, NOW));
    assert.ok(!canRetry({ status: "sending", started_at: ago(2) }, NOW));
    assert.ok(!canRetry({ status: "sent" }, NOW));
    assert.ok(!canRetry({ status: "queued", queued_at: ago(1) }, NOW));
  });
});

describe("outcome", () => {
  it("is sent, partial or failed by what got through", () => {
    assert.equal(outcome({ sent: 3, failed: 0 }), "sent");
    assert.equal(outcome({ sent: 2, failed: 1 }), "partial");
    assert.equal(outcome({ sent: 0, failed: 3 }), "failed");
    assert.equal(outcome({ sent: 0, failed: 0 }), "sent"); // nobody to send to
  });
});

describe("describeJob", () => {
  it("says what it is and who it goes to", () => {
    assert.equal(
      describeJob({ kind: "digest", audience: "emails", to_emails: ["a@x.com"], test: true }),
      "Test: Weekly digest to a@x.com",
    );
    assert.equal(
      describeJob({ kind: "digest", audience: "subscribers", days: 14 }),
      "Weekly digest (14 days) to every subscriber",
    );
    assert.equal(
      describeJob({
        kind: "custom",
        audience: "emails",
        to_emails: ["a@x.com", "b@x.com"],
        subject: "Hi",
      }),
      '"Hi" to 2 addresses',
    );
  });
});
