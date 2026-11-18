/**
 * digest/run.js — sends one email job (a row of email_jobs, or the same shape built by
 * digest/send.js): who it goes to, what each person's copy says, and the sending loop.
 * No database or SMTP code here: `store` (digest/store.js) and `send` (digest/smtp.js)
 * are passed in, so this is tested with stand-ins (tests/digest_run.test.js).
 *
 * A job with an id is logged per address (email_deliveries). Sent again, it skips every
 * address already delivered, so a run that died part-way can be finished without anyone
 * getting the email twice.
 */
import { renderDigest, summarize, SITE } from "@lfs/core/email/digest.js";
import { renderCustom } from "@lfs/core/email/custom.js";

const unsubscribeUrl = (job, r) =>
  // Someone else's digest in the owner's inbox carries nobody's unsubscribe link.
  job.as_user || !r.token ? null : `${SITE}/?unsubscribe=${encodeURIComponent(r.token)}`;

// An SMTP error can quote the address it failed on; run logs are public.
export const scrub = (message, email) =>
  String(message ?? "")
    .split(email)
    .join("<address>");

/**
 * Who a job goes to and what each copy says.
 * @returns {Promise<{ to: object[], renderFor: (recipient) => {subject, html, text, unsubscribeUrl} }>}
 */
export async function buildEmail(job, { store, today }) {
  if (!["emails", "subscribers"].includes(job.audience)) {
    throw new Error(`Unknown audience "${job.audience}"`);
  }
  const everyone = job.audience === "subscribers";
  const to = everyone ? await store.subscribers() : await store.accounts(job.to_emails ?? []);

  if (job.kind === "custom") {
    return {
      to,
      renderFor: (r) => {
        const url = unsubscribeUrl(job, r);
        return {
          ...renderCustom(job, {
            unsubscribeUrl: url,
            test: job.test,
            button: job.with_button,
            lang: r.language,
          }),
          unsubscribeUrl: url,
        };
      },
    };
  }
  if (job.kind !== "digest") throw new Error(`Unknown kind of email "${job.kind}"`);

  const days = Number(job.days ?? 7);
  const summary = summarize(await store.weekRows(today, days), { today, days });
  // Every subscriber's areas in one read; a list of addresses reads only its accounts';
  // "as" someone reads only theirs, and every copy shows them.
  const ids = job.as_user ? [job.as_user] : to.map((r) => r.id).filter(Boolean);
  const personal = everyone || ids.length;
  const scope = everyone ? null : ids;
  // The watch areas and saved places, each in one read, side by side.
  const [areasByUser, savedByUser] = personal
    ? await Promise.all([store.watchAreas(days, scope), store.savedPlaces(days, scope)])
    : [new Map(), new Map()];
  const whose = (r) => job.as_user ?? r.id;
  // A digest sent "as" someone is in their language, whoever receives it.
  const asLanguage = job.as_user ? await store.language(job.as_user) : null;
  return {
    to,
    summary,
    withAreas: areasByUser.size,
    withSaved: savedByUser.size,
    renderFor: (r) => {
      const url = unsubscribeUrl(job, r);
      return {
        ...renderDigest(summary, {
          unsubscribeUrl: url,
          areas: areasByUser.get(whose(r)) ?? [],
          saved: savedByUser.get(whose(r)) ?? [],
          test: job.test,
          lang: asLanguage ?? r.language,
        }),
        unsubscribeUrl: url,
      };
    },
  };
}

/**
 * Sends a job. `send({ to, subject, html, text, unsubscribeUrl })` delivers one email and
 * throws when it can't.
 * @returns {Promise<{ total, sent, failed, skipped }>} skipped: delivered by an earlier run
 */
export async function runJob(job, { store, send, today, log = () => {} }) {
  const { to, renderFor, summary, withAreas, withSaved } = await buildEmail(job, {
    store,
    today,
  });
  if (summary) {
    log(
      `${summary.total} inspections since ${summary.since}, ${summary.failing.length} failing, ` +
        `${summary.perfect.length} perfect.`,
    );
  }
  const already = job.id ? await store.delivered(job.id) : new Set();
  log(
    `${to.length} recipients` +
      (withAreas != null ? `, ${withAreas} with watch areas` : "") +
      (withSaved != null ? `, ${withSaved} with saved places` : "") +
      (already.size ? `, ${already.size} already delivered` : "") +
      ".",
  );

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const [i, r] of to.entries()) {
    if (already.has(r.email.toLowerCase())) {
      skipped++;
      continue;
    }
    let error = null;
    try {
      await send({ to: r.email, ...renderFor(r) });
      sent++;
    } catch (e) {
      failed++;
      error = e.message ?? String(e);
      log(`  ✗ recipient ${i + 1} of ${to.length}: ${scrub(error, r.email)}`);
    }
    if (job.id) {
      // The email went (or didn't) whatever happens to its log line.
      await store
        .recordDelivery(job.id, r, error ? "failed" : "sent", error)
        .catch((e) => log(`  delivery not logged: ${scrub(e.message, r.email)}`));
    }
  }
  return { total: to.length, sent, failed, skipped };
}
