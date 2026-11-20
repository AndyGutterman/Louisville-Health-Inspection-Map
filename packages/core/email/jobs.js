/**
 * email/jobs.js — the rules for an email job: one row of email_jobs, queued on the site's
 * email admin page and sent by the pipeline (docs/EMAIL_ADMIN.md). Pure. The database
 * enforces the same limits (admin_queue_email); these give the form its messages and tell
 * the sender what to do with a job.
 *
 * A job: { kind: "digest"|"custom", audience: "emails"|"subscribers", to_emails, as_user,
 *          days, test, subject, body, with_button, status, queued_at, started_at }
 */
export const LIMITS = {
  emails: 20, // addresses typed into one job
  subject: 150,
  body: 10000,
  minDays: 1,
  maxDays: 30,
  expireHours: 24, // a job queued longer than this is never sent
  stuckMinutes: 15, // a job "sending" longer than this died; it can be sent again
};

const EMAIL_RE = /^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/;
export const isEmail = (s) => EMAIL_RE.test(String(s ?? "").trim());

/**
 * Addresses typed into a box, separated by commas, semicolons, spaces or new lines.
 * @returns {{ emails: string[], invalid: string[] }} emails: each once, as typed
 */
export function parseEmails(text) {
  const emails = [];
  const invalid = [];
  const seen = new Set();
  for (const part of String(text ?? "").split(/[\s,;]+/)) {
    if (!part) continue;
    if (!isEmail(part)) invalid.push(part);
    else if (!seen.has(part.toLowerCase())) {
      seen.add(part.toLowerCase());
      emails.push(part);
    }
  }
  return { emails, invalid };
}

/** What is wrong with a job, in words for the form; null when it can be queued. */
export function checkJob(job) {
  if (!["digest", "custom"].includes(job.kind)) return "Unknown kind of email.";
  if (job.audience === "emails") {
    const to = job.to_emails ?? [];
    if (!to.length) return "Add at least one address.";
    if (to.length > LIMITS.emails) return `${LIMITS.emails} addresses at most.`;
    const bad = to.find((e) => !isEmail(e));
    if (bad) return `"${bad}" isn't an email address.`;
  } else if (job.audience === "subscribers") {
    if (job.to_emails != null) return "An email to every subscriber takes no address list.";
    if (job.as_user) return "An email to every subscriber is each person's own.";
  } else return "Unknown audience.";
  if (job.kind === "custom") {
    const subject = String(job.subject ?? "").trim();
    const body = String(job.body ?? "").trim();
    if (!subject) return "Add a subject.";
    if (subject.length > LIMITS.subject) return `The subject is over ${LIMITS.subject} characters.`;
    if (!body) return "Write a message.";
    if (body.length > LIMITS.body) return `The message is over ${LIMITS.body} characters.`;
  } else {
    const days = Number(job.days ?? 7);
    if (!Number.isInteger(days) || days < LIMITS.minDays || days > LIMITS.maxDays) {
      return `The digest covers ${LIMITS.minDays} to ${LIMITS.maxDays} days.`;
    }
  }
  return null;
}

const minutesSince = (iso, now) => (now - new Date(iso).getTime()) / 60000;

/** A queued job whose time has come: no scheduled time, or one that has passed. */
export const isDue = (job, now = Date.now()) => !job.send_at || new Date(job.send_at) <= now;

/**
 * A queued job that waited too long is not sent: a stale "everyone" must not go out late.
 * A scheduled job waits from its scheduled time, not from when it was queued.
 */
export const isExpired = (job, now = Date.now()) =>
  job.status === "queued" &&
  minutesSince(job.send_at ?? job.queued_at, now) > LIMITS.expireHours * 60;

/** Tuesday's digest is paused and this is the scheduled run: nothing goes out. */
export const skipsScheduledDigest = ({ scheduled, paused }) =>
  scheduled === true && paused === true;

/** A job whose sender died part-way: still "sending" long after it started. */
export const isStuck = (job, now = Date.now()) =>
  job.status === "sending" &&
  job.started_at != null &&
  minutesSince(job.started_at, now) > LIMITS.stuckMinutes;

export const isActive = (job, now = Date.now()) =>
  (job.status === "queued" || job.status === "sending") && !isStuck(job, now);

/** Can the admin page offer "Send again" (only what wasn't delivered is sent)? */
export const canRetry = (job, now = Date.now()) =>
  ["failed", "partial", "expired", "cancelled"].includes(job.status) || isStuck(job, now);

/** How a finished run is recorded. Nobody to send to counts as sent: nothing failed. */
export const outcome = ({ sent, failed }) =>
  failed === 0 ? "sent" : sent === 0 ? "failed" : "partial";

const STATUS_LABELS = {
  queued: "Queued",
  sending: "Sending",
  sent: "Sent",
  partial: "Partly sent",
  failed: "Failed",
  cancelled: "Cancelled",
  expired: "Expired",
};
export const statusLabel = (job, now = Date.now()) =>
  isStuck(job, now) ? "Stalled" : (STATUS_LABELS[job.status] ?? job.status);

/** One line saying what a job is and who it goes to, for the activity list. */
export function describeJob(job) {
  const what =
    job.kind === "custom"
      ? `"${String(job.subject ?? "").trim() || "No subject"}"`
      : `Weekly digest${Number(job.days ?? 7) === 7 ? "" : ` (${job.days} days)`}`;
  const n = job.to_emails?.length ?? 0;
  const who =
    job.audience === "subscribers"
      ? "every subscriber"
      : n === 1
        ? job.to_emails[0]
        : `${n} addresses`;
  return `${job.test ? "Test: " : ""}${what} to ${who}`;
}
