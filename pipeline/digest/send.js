/**
 * digest/send.js — the weekly digest email (.github/workflows/digest.yml, Tuesdays).
 *
 * This week's inspections from get_whats_new: the ones that failed, the perfect scores.
 * Above that, each of the recipient's watch areas is its own part of the email, with the
 * week's inspections inside that circle (digest_watch_areas). Recipients are profiles with
 * alert_frequency = 'weekly' (the sign-in checkbox / account toggle); each gets their own
 * unsubscribe link.
 *
 * The send is the same job the email admin page queues (digest/run.js), and is logged
 * the same way (email_jobs, email_deliveries), so it shows on that page and a run that
 * died part-way can be finished from there. On a database without those tables the
 * email still goes out, unlogged.
 *
 * Usage (from pipeline/):
 *   node digest/send.js                         # send to every subscriber
 *   node digest/send.js --to=a@x.com,b@y.com    # send only to these (test group); they
 *                                               # need not be subscribers. An address
 *                                               # with an account gets its watch areas.
 *   node digest/send.js --to=a@x.com --test     # the same, with "[Test]" in the subject
 *   node digest/send.js --dry-run               # no email: writes digest-preview.html
 *   node digest/send.js --days=14               # a longer window (default 7)
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY; to send, SMTP_SERVER, SMTP_USERNAME,
 * SMTP_PASSWORD (the same secrets the backup workflow uses) and optionally
 * DIGEST_FROM ("Louisville Food Safe <you@example.com>", defaults to SMTP_USERNAME).
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { outcome, skipsScheduledDigest } from "@lfs/core/email/jobs.js";
import { buildEmail, runJob } from "./run.js";
import { makeStore } from "./store.js";
import { createSender, louisvilleToday, runUrl } from "./smtp.js";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const TO = args
  .find((a) => a.startsWith("--to="))
  ?.slice(5)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const DAYS = Number(args.find((a) => a.startsWith("--days="))?.slice(7) ?? 7);
const PREVIEW = "digest-preview.html";

(async function run() {
  const { supa } = await import("../lib/db.js");
  const store = makeStore(supa);
  // The Tuesday schedule stops when the owner has paused it (admin_set_digest_paused).
  // A run started by hand still goes.
  const scheduled = process.env.GITHUB_EVENT_NAME === "schedule";
  if (skipsScheduledDigest({ scheduled, paused: await store.digestPaused() })) {
    console.log("Tuesday's digest is paused on the admin page: nothing sent.");
    return;
  }
  const today = louisvilleToday();
  const job = {
    kind: "digest",
    audience: TO?.length ? "emails" : "subscribers",
    to_emails: TO?.length ? TO : null,
    days: DAYS,
    test: args.includes("--test"),
  };

  if (DRY_RUN) {
    // The preview is the first recipient's email (with --to, that address's watch areas).
    const { to, renderFor, summary } = await buildEmail(job, { store, today });
    const { subject, html } = renderFor({ ...(to[0] ?? { id: null }), token: "preview" });
    writeFileSync(PREVIEW, html);
    console.log(
      `${summary.total} inspections since ${summary.since}, ${to.length} recipients.\n` +
        `Dry run. Subject: ${subject}\nWrote ${PREVIEW}; nothing sent.`,
    );
    return;
  }

  const send = createSender();
  // Logged like a job from the admin page. Best effort: the email matters more.
  const id = await store
    .createJob({
      ...job,
      source: process.env.GITHUB_EVENT_NAME === "schedule" ? "schedule" : "manual",
      status: "sending",
      started_at: new Date().toISOString(),
      run_url: runUrl(),
    })
    .catch((e) => {
      console.warn(`This send isn't logged (${e.message}).`);
      return null;
    });

  let result;
  try {
    result = await runJob({ ...job, id }, { store, send, today, log: console.log });
  } catch (e) {
    if (id) await store.finish(id, { status: "failed", error: e.message }).catch(() => {});
    throw e;
  }
  const { total, sent, failed } = result;
  if (id) {
    await store
      .finish(id, {
        status: outcome({ sent, failed }),
        recipient_count: total,
        sent_count: sent,
        failed_count: failed,
        error: failed ? `${failed} of ${total} could not be delivered.` : null,
      })
      .catch((e) => console.warn(`Result not logged (${e.message}).`));
  }
  console.log(
    total
      ? `Sent ${sent}${TO ? " (test group)" : ""}, ${failed} failed.`
      : "No recipients; nothing sent.",
  );
  if (failed) process.exit(1);
})().catch((err) => {
  console.error("Digest failed:", err.message);
  process.exit(1);
});
