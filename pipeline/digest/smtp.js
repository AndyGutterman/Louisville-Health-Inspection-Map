/**
 * digest/smtp.js — the one place email leaves from: SMTP on port 587 with the workflow's
 * secrets (docs/DIGEST.md, "Sending"). Gmail rewrites the From line to the logged-in
 * account, so the login decides the sender; DIGEST_FROM only changes the display name.
 */
import nodemailer from "nodemailer";

// Names the list, so mail providers can sort and unsubscribe from it as one sender's list.
const LIST_ID = "Louisville Food Safe <email.louisvillefoodsafe.netlify.app>";

/**
 * The list headers for one email: List-Id, and List-Unsubscribe with the site's
 * unsubscribe page. With ONE_CLICK_UNSUBSCRIBE=on (a repository variable, set once the
 * `unsubscribe` edge function is deployed), List-Unsubscribe points at that function
 * instead, with List-Unsubscribe-Post, so Gmail and Outlook can unsubscribe in one click
 * (RFC 8058 allows one HTTPS link there). An email with no unsubscribe link gets none.
 */
export function listHeaders({ unsubscribeUrl, unsubscribeToken }, env = process.env) {
  if (!unsubscribeUrl) return {};
  const base = String(env.SUPABASE_URL ?? "").replace(/\/+$/, "");
  if (env.ONE_CLICK_UNSUBSCRIBE === "on" && base && unsubscribeToken) {
    const oneClick = `${base}/functions/v1/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
    return {
      "List-Id": LIST_ID,
      "List-Unsubscribe": `<${oneClick}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    };
  }
  return { "List-Id": LIST_ID, "List-Unsubscribe": `<${unsubscribeUrl}>` };
}

/** @returns {(email: {to, subject, html, text, unsubscribeUrl, unsubscribeToken}) => Promise<void>} */
export function createSender(env = process.env) {
  const { SMTP_SERVER, SMTP_USERNAME, SMTP_PASSWORD } = env;
  if (!SMTP_SERVER || !SMTP_USERNAME || !SMTP_PASSWORD) {
    throw new Error("SMTP_SERVER, SMTP_USERNAME and SMTP_PASSWORD are needed to send");
  }
  const transport = nodemailer.createTransport({
    host: SMTP_SERVER,
    port: 587,
    secure: false,
    auth: { user: SMTP_USERNAME, pass: SMTP_PASSWORD },
  });
  const from = env.DIGEST_FROM || `Louisville Food Safe <${SMTP_USERNAME}>`;
  return ({ to, subject, html, text, unsubscribeUrl, unsubscribeToken }) =>
    transport.sendMail({
      from,
      to,
      subject,
      html,
      text,
      headers: listHeaders({ unsubscribeUrl, unsubscribeToken }, env),
    });
}

export const louisvilleToday = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Kentucky/Louisville" });

// The GitHub Actions run this is, for the job's log; null anywhere else.
export const runUrl = (env = process.env) =>
  env.GITHUB_RUN_ID && env.GITHUB_REPOSITORY
    ? `${env.GITHUB_SERVER_URL || "https://github.com"}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
    : null;
