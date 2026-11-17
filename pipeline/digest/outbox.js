/**
 * digest/outbox.js — sends what the email admin page queued (docs/EMAIL_ADMIN.md,
 * .github/workflows/email-outbox.yml). Every queued row of email_jobs, oldest first:
 * taken (so two runs can't both send it), sent by digest/run.js, and marked with what
 * happened. A job queued more than a day ago is marked expired, not sent.
 *
 * Usage (from pipeline/):   node digest/outbox.js
 * Env: the same as digest/send.js.
 *
 * Nothing here prints an address: the workflow's logs are public.
 */
import "dotenv/config";
import { isExpired, outcome } from "@lfs/core/email/jobs.js";
import { runJob } from "./run.js";
import { makeStore } from "./store.js";
import { createSender, louisvilleToday, runUrl } from "./smtp.js";

const label = (job) => `${job.id.slice(0, 8)} (${job.kind}, ${job.audience})`;

(async function run() {
  const { supa } = await import("../lib/db.js");
  const store = makeStore(supa);
  let send = null; // made when the first job needs it: an empty outbox needs no SMTP
  let done = 0;
  let trouble = 0;

  // Jobs queued while this run is sending are picked up by the next pass.
  for (let pass = 0; pass < 5; pass++) {
    const jobs = await store.queuedJobs();
    if (!jobs.length) break;
    for (const queued of jobs) {
      if (isExpired(queued)) {
        await store.finish(queued.id, {
          status: "expired",
          error: "Waited more than a day in the queue, so it wasn't sent.",
        });
        console.log(`${label(queued)}: expired, not sent.`);
        continue;
      }
      send ??= createSender();
      const job = await store.claim(queued.id);
      if (!job) continue; // cancelled, or another run took it
      console.log(`${label(job)}: sending.`);
      try {
        const r = await runJob(job, { store, send, today: louisvilleToday(), log: console.log });
        const delivered = r.sent + r.skipped;
        const status = outcome({ sent: delivered, failed: r.failed });
        await store.finish(job.id, {
          status,
          recipient_count: r.total,
          sent_count: delivered,
          failed_count: r.failed,
          error: r.failed ? `${r.failed} of ${r.total} could not be delivered.` : null,
          run_url: runUrl(),
        });
        console.log(`${label(job)}: ${status}. Sent ${r.sent}, failed ${r.failed}.`);
        if (r.failed) trouble++;
      } catch (e) {
        trouble++;
        console.error(`${label(job)}: failed: ${e.message}`);
        await store.finish(job.id, { status: "failed", error: e.message, run_url: runUrl() });
      }
      done++;
    }
  }
  console.log(done ? `Outbox done: ${done} job(s).` : "Nothing queued.");
  if (trouble) process.exit(1);
})().catch((err) => {
  console.error("Outbox failed:", err.message);
  process.exit(1);
});
