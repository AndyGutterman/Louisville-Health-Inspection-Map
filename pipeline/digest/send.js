/**
 * digest/send.js — the weekly digest email (.github/workflows/digest.yml, Tuesdays).
 *
 * This week's inspections from get_whats_new: the ones that failed, the perfect scores.
 * Above that, each of the recipient's watch areas is its own part of the email, with the
 * week's inspections inside that circle (digest_watch_areas). Recipients are profiles with
 * alert_frequency = 'weekly' (the sign-in checkbox / account toggle); each gets their own
 * unsubscribe link.
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
import nodemailer from "nodemailer";
import { groupWatchAreas, renderDigest, summarize, SITE } from "./render.js";
import { readAllPages } from "../lib/paging.js";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const TO = args
  .find((a) => a.startsWith("--to="))
  ?.slice(5)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const TEST = args.includes("--test");
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
    .map((p) => ({
      id: p.id,
      email: (p.alert_email || p.email || "").trim(),
      token: p.digest_token,
    }))
    .filter((r) => r.email.includes("@"));
}

// A test group: each address, with its account when it has one (so the test shows that
// person's watch areas) and its unsubscribe link only when it is subscribed.
async function testGroup(supa, emails) {
  const lower = emails.map((e) => e.toLowerCase());
  const found = new Map();
  for (const column of ["email", "alert_email"]) {
    const rows = must(
      await supa
        .from("profiles")
        .select("id, email, alert_email, digest_token, alert_frequency")
        .in(column, [...new Set([...emails, ...lower])]),
      "read the test group's accounts",
    );
    for (const p of rows) {
      for (const e of [p.alert_email, p.email]) {
        if (e && !found.has(e.trim().toLowerCase())) found.set(e.trim().toLowerCase(), p);
      }
    }
  }
  return emails.map((email) => {
    const p = found.get(email.toLowerCase());
    return {
      id: p?.id ?? null,
      email,
      token: p?.alert_frequency === "weekly" ? p.digest_token : null,
    };
  });
}

// Each recipient's watch areas for the week: Map of user id -> areas. One small read
// (a few rows per area). The email still goes out without them if the read fails, for
// example on a database that doesn't have digest_watch_areas yet.
async function watchAreas(supa, userIds) {
  try {
    const rows = await readAllPages((from, to) =>
      supa
        .rpc("digest_watch_areas", { p_days: DAYS, p_user_ids: userIds })
        .order("user_id")
        .order("area_id")
        .order("place_rank")
        .range(from, to),
    );
    return groupWatchAreas(rows);
  } catch (e) {
    console.warn(`Watch areas left out (${e.message}).`);
    return new Map();
  }
}

(async function run() {
  const { supa } = await import("../lib/db.js");
  const rows = must(await supa.rpc("get_whats_new", { limit_n: 2000 }), "read what's new");
  const summary = summarize(rows, { today: today(), days: DAYS });
  console.log(
    `${summary.total} inspections since ${summary.since}, ${summary.failing.length} failing, ` +
      `${summary.perfect.length} perfect.`,
  );

  // A test group gets only its own accounts' watch areas; a real send, every subscriber's.
  const to = TO?.length ? await testGroup(supa, TO) : await recipients(supa);
  const ids = to.map((r) => r.id).filter(Boolean);
  const areasByUser =
    TO?.length && !ids.length ? new Map() : await watchAreas(supa, TO?.length ? ids : null);
  const areasOf = (r) => (r.id && areasByUser.get(r.id)) || [];
  console.log(`${to.length} recipients, ${areasByUser.size} with watch areas.`);

  if (DRY_RUN) {
    // The preview is the first recipient's email (with --to, that address's watch areas).
    const { subject, html } = renderDigest(summary, {
      unsubscribeUrl: `${SITE}/?unsubscribe=preview`,
      areas: to[0] ? areasOf(to[0]) : [],
      test: TEST,
    });
    writeFileSync(PREVIEW, html);
    console.log(`Dry run. Subject: ${subject}\nWrote ${PREVIEW}; nothing sent.`);
    return;
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
    const { subject, html, text } = renderDigest(summary, {
      unsubscribeUrl,
      areas: areasOf(r),
      test: TEST,
    });
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
