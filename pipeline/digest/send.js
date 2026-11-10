/**
 * digest/send.js — the weekly digest email (.github/workflows/digest.yml, Tuesdays).
 *
 * One email, the same for everyone: this week's inspections from get_whats_new, the ones
 * that failed, the perfect scores. Recipients are profiles with alert_frequency = 'weekly'
 * (the sign-in checkbox / account toggle); each gets their own unsubscribe link.
 *
 * Usage (from pipeline/):
 *   node digest/send.js                         # send to every subscriber
 *   node digest/send.js --to=a@x.com,b@y.com    # send only to these (test group); they
 *                                               # need not be subscribers
 *   node digest/send.js --dry-run               # no email: writes digest-preview.html
 *   node digest/send.js --days=14               # a longer window (default 7)
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY; to send, SMTP_SERVER, SMTP_USERNAME,
 * SMTP_PASSWORD (the same secrets the backup workflow uses) and optionally
 * DIGEST_FROM ("Louisville Food Safe <you@example.com>", defaults to SMTP_USERNAME).
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import nodemailer from "nodemailer";
import { renderDigest, summarize, SITE } from "./render.js";
import { readAllPages } from "../lib/paging.js";

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

const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Kentucky/Louisville" });

const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};

async function recipients(supa) {
  const rows = await readAllPages((from, to) =>
    supa
      .from("profiles")
      .select("id, email, alert_email, digest_token")
      .eq("alert_frequency", "weekly")
      .order("id")
      .range(from, to),
  );
  return rows
    .map((p) => ({ email: (p.alert_email || p.email || "").trim(), token: p.digest_token }))
    .filter((r) => r.email.includes("@"));
}

(async function run() {
  const { supa } = await import("../lib/db.js");
  const rows = must(await supa.rpc("get_whats_new", { limit_n: 2000 }), "read what's new");
  const summary = summarize(rows, { today: today(), days: DAYS });
  console.log(
    `${summary.total} inspections since ${summary.since}, ${summary.failing.length} failing, ` +
      `${summary.perfect.length} perfect.`,
  );

  if (DRY_RUN) {
    const { subject, html } = renderDigest(summary, {
      unsubscribeUrl: `${SITE}/?unsubscribe=preview`,
    });
    writeFileSync(PREVIEW, html);
    console.log(`Dry run. Subject: ${subject}\nWrote ${PREVIEW}; nothing sent.`);
    return;
  }

  let to;
  if (TO?.length) {
    // A test group: subscribers keep their own token; anyone else gets no unsubscribe link.
    const subs = new Map((await recipients(supa)).map((r) => [r.email.toLowerCase(), r.token]));
    to = TO.map((email) => ({ email, token: subs.get(email.toLowerCase()) ?? null }));
  } else {
    to = await recipients(supa);
  }
  if (!to.length) {
    console.log("No recipients; nothing sent.");
    return;
  }

  const { SMTP_SERVER, SMTP_USERNAME, SMTP_PASSWORD } = process.env;
  if (!SMTP_SERVER || !SMTP_USERNAME || !SMTP_PASSWORD) {
    throw new Error("SMTP_SERVER, SMTP_USERNAME and SMTP_PASSWORD are needed to send");
  }
  const transport = nodemailer.createTransport({
    host: SMTP_SERVER,
    port: 587,
    secure: false,
    auth: { user: SMTP_USERNAME, pass: SMTP_PASSWORD },
  });
  const from = process.env.DIGEST_FROM || `Louisville Food Safe <${SMTP_USERNAME}>`;

  let sent = 0;
  let failed = 0;
  for (const r of to) {
    const unsubscribeUrl = r.token ? `${SITE}/?unsubscribe=${encodeURIComponent(r.token)}` : null;
    const { subject, html, text } = renderDigest(summary, { unsubscribeUrl });
    try {
      await transport.sendMail({
        from,
        to: r.email,
        subject,
        html,
        text,
        headers: unsubscribeUrl ? { "List-Unsubscribe": `<${unsubscribeUrl}>` } : {},
      });
      sent++;
    } catch (e) {
      failed++;
      console.error(`  ✗ ${r.email}: ${e.message}`);
    }
  }
  console.log(`Sent ${sent}${TO ? " (test group)" : ""}, ${failed} failed.`);
  if (failed) process.exit(1);
})().catch((err) => {
  console.error("Digest failed:", err.message);
  process.exit(1);
});
