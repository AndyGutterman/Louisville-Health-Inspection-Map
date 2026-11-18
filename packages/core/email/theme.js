/**
 * email/theme.js — what every email from the site shares: the colours, the outer page
 * (dark card, the brand line), the button and the footer. Email clients need tables and
 * inline styles, so that's what this is. Styled like the site: dark card, green accent,
 * amber for violations, red for a C placard.
 */
import { wordsFor } from "./words.js";

export const SITE = "https://louisvillefoodsafe.netlify.app";

export const BG = "#0f0f12";
export const CARD = "#1b1b1f";
export const TEXT = "#f0f0f3";
export const DIM = "rgba(255,255,255,0.55)";
export const GREEN = "#6fcf8a";
export const AMBER = "#f97316";
export const RED = "#ff6b6b";
export const PLAIN = "#c9c9d1"; // a passing score that isn't perfect
export const RULE = "1px solid rgba(255,255,255,0.07)";

export const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

// The green pill at the bottom of an email, as a table row.
export const mapButton = (
  label = wordsFor("en").openMap,
  href = SITE,
) => `<tr><td style="padding:24px 0 0;" align="center">
    <a href="${href}" style="display:inline-block;padding:11px 20px;border-radius:999px;background:rgba(52,168,83,0.16);border:1px solid rgba(52,168,83,0.34);color:${GREEN};font-weight:700;font-size:14px;text-decoration:none;">${esc(label)}</a>
  </td></tr>`;

// "Unsubscribe · About the data · Privacy". unsubscribeUrl is per recipient; null leaves
// it out.
export const footerLinks = (unsubscribeUrl, lang = "en") => {
  const w = wordsFor(lang);
  return [
    unsubscribeUrl ? `<a href="${unsubscribeUrl}" style="color:${DIM};">${w.unsubscribe}</a>` : "",
    `<a href="${SITE}/?page=learn" style="color:${DIM};">${w.aboutData}</a>`,
    `<a href="${SITE}/?page=privacy" style="color:${DIM};">${w.privacy}</a>`,
  ]
    .filter(Boolean)
    .join(" · ");
};

/**
 * The whole document. header: HTML under the brand line (the headline). rows: the table
 * rows of the body, each a <tr>.
 */
export const page = ({ title, header, rows, lang = "en" }) => `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${BG};color:${TEXT};font-family:system-ui,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${CARD};border:1px solid rgba(255,255,255,0.08);border-radius:14px;">
<tr><td style="padding:22px 24px 0;">
  <div style="font-size:12px;font-weight:800;letter-spacing:.14em;"><span style="color:${TEXT};">LOUISVILLE</span> <span style="color:${AMBER};">FOOD</span> <span style="color:${GREEN};">SAFE</span></div>
  ${header}
</td></tr>
<tr><td style="padding:0 24px 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  ${rows}
</table></td></tr>
</table></td></tr></table></body></html>`;
