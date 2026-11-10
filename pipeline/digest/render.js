/**
 * digest/render.js — the weekly digest email, from get_whats_new rows. Pure: no network,
 * no clock (the caller passes `today`), so it can be tested and previewed. Styled like the
 * site: dark card, green accent, amber for violations, red for a C placard. Email clients
 * need tables and inline styles, so that's what this is.
 */
import { regionName } from "./regions.js";

export const SITE = "https://louisvillefoodsafe.netlify.app";
export const FAIL_SCORE = 85; // the site's "failing" line (What's New uses the same)

const BG = "#0f0f12";
const CARD = "#1b1b1f";
const TEXT = "#f0f0f3";
const DIM = "rgba(255,255,255,0.55)";
const GREEN = "#6fcf8a";
const AMBER = "#f97316";
const RED = "#ff6b6b";
const RULE = "1px solid rgba(255,255,255,0.07)";

const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

const isC = (r) => String(r.grade ?? "").toUpperCase() === "C";
const isFailing = (r) => isC(r) || (r.score ?? 100) < FAIL_SCORE;
const dateOf = (r) => r.inspection_date ?? r.posted_date ?? null;
const daysBefore = (today, days) => {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};
const shortDate = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

/**
 * What the email says, as data. rows: get_whats_new(limit_n) rows over any window; this
 * keeps the last `days` up to and including `today` (YYYY-MM-DD).
 */
export function summarize(rows, { today, days = 7 }) {
  const since = daysBefore(today, days - 1);
  const recent = (rows || []).filter((r) => {
    const d = dateOf(r);
    return d != null && d >= since && d <= today;
  });
  const byRegion = {};
  for (const r of recent) byRegion[r.region] = (byRegion[r.region] ?? 0) + 1;
  const failing = recent.filter(isFailing).sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
  const perfect = recent
    .filter((r) => r.score === 100)
    .sort((a, b) => (dateOf(b) ?? "").localeCompare(dateOf(a) ?? ""));
  return { since, today, days, total: recent.length, byRegion, failing, perfect };
}

const placeLink = (r) => `${SITE}/?eid=${encodeURIComponent(r.establishment_id)}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function placeRow(r, colour) {
  const when = dateOf(r) ? shortDate(dateOf(r)) : "";
  const viol = r.violation_count > 0 ? plural(r.violation_count, "violation") : "";
  const meta = [regionName(r.region), when, viol].filter(Boolean).join(" · ");
  return `
    <tr>
      <td style="padding:10px 0;border-top:${RULE};">
        <a href="${placeLink(r)}" style="color:${TEXT};font-weight:700;text-decoration:none;font-size:15px;">${esc(r.premise_name)}</a>
        <div style="color:${DIM};font-size:13px;margin-top:2px;">${esc(r.address)}</div>
        <div style="color:${DIM};font-size:12px;margin-top:2px;">${esc(meta)}</div>
      </td>
      <td align="right" valign="top" style="padding:10px 0 0 12px;border-top:${RULE};white-space:nowrap;">
        <span style="display:inline-block;min-width:34px;padding:6px 10px;border-radius:8px;background:${colour};color:#111;font-weight:800;font-size:15px;text-align:center;">${esc(r.score ?? "–")}</span>
        ${r.grade ? `<div style="color:${DIM};font-size:12px;margin-top:4px;text-align:center;">${esc(r.grade)} placard</div>` : ""}
      </td>
    </tr>`;
}

function section(title, rowsHtml) {
  return `
    <tr><td style="padding:22px 0 6px;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:${DIM};">${esc(title)}</td></tr>
    <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table></td></tr>`;
}

/**
 * The email: { subject, html, text }. unsubscribeUrl is per recipient; null for a preview.
 */
export function renderDigest(
  summary,
  { unsubscribeUrl = null, maxFailing = 25, maxPerfect = 8 } = {},
) {
  const { total, byRegion, failing, perfect, since, today } = summary;
  const counts = Object.entries(byRegion)
    .map(([region, n]) => `${n} in ${regionName(region)}`)
    .join(", ");
  const range = `${shortDate(since)} – ${shortDate(today)}`;
  const subject = `${plural(total, "inspection")} this week, ${failing.length} failing · Louisville Food Safe`;

  const failingHtml = failing.length
    ? failing
        .slice(0, maxFailing)
        .map((r) => placeRow(r, isC(r) ? RED : AMBER))
        .join("")
    : `<tr><td style="padding:10px 0;color:${DIM};font-size:14px;">Nothing scored under ${FAIL_SCORE} this week.</td></tr>`;
  const more =
    failing.length > maxFailing
      ? `<tr><td style="padding:8px 0;"><a href="${SITE}" style="color:${GREEN};font-size:13px;">and ${failing.length - maxFailing} more on the map →</a></td></tr>`
      : "";
  const perfectHtml = perfect
    .slice(0, maxPerfect)
    .map((r) => placeRow(r, GREEN))
    .join("");
  const footerLinks = [
    unsubscribeUrl ? `<a href="${unsubscribeUrl}" style="color:${DIM};">Unsubscribe</a>` : "",
    `<a href="${SITE}/?page=learn" style="color:${DIM};">About the data</a>`,
  ]
    .filter(Boolean)
    .join(" · ");

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${BG};color:${TEXT};font-family:system-ui,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${CARD};border:1px solid rgba(255,255,255,0.08);border-radius:14px;">
<tr><td style="padding:22px 24px 0;">
  <div style="font-size:12px;font-weight:800;letter-spacing:.14em;"><span style="color:${TEXT};">LOUISVILLE</span> <span style="color:${AMBER};">FOOD</span> <span style="color:${GREEN};">SAFE</span></div>
  <div style="font-size:22px;font-weight:800;margin-top:10px;line-height:1.25;">${plural(total, "inspection")} this week</div>
  <div style="color:${DIM};font-size:13px;margin-top:4px;">${esc(range)}${counts ? ` · ${esc(counts)}` : ""}</div>
</td></tr>
<tr><td style="padding:0 24px 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  ${section(`Scored under ${FAIL_SCORE} or a C placard`, failingHtml + more)}
  ${perfect.length ? section("Perfect scores", perfectHtml) : ""}
  <tr><td style="padding:24px 0 0;" align="center">
    <a href="${SITE}" style="display:inline-block;padding:11px 20px;border-radius:999px;background:rgba(52,168,83,0.16);border:1px solid rgba(52,168,83,0.34);color:${GREEN};font-weight:700;font-size:14px;text-decoration:none;">Open the map</a>
  </td></tr>
  <tr><td style="padding:22px 0 0;color:${DIM};font-size:11px;line-height:1.6;text-align:center;">
    Scores and placards are the health departments' own. Bullitt County publishes no dates or placards.<br>${footerLinks}<br>Louisville Food Safe · Louisville, KY
  </td></tr>
</table></td></tr>
</table></td></tr></table></body></html>`;

  const line = (r) =>
    `  ${r.score ?? "–"}${r.grade ? ` (${r.grade})` : ""}  ${r.premise_name}, ${r.address}`;
  const text = [
    `Louisville Food Safe: ${plural(total, "inspection")} this week (${range})${counts ? `, ${counts}` : ""}`,
    "",
    `Scored under ${FAIL_SCORE} or a C placard:`,
    ...(failing.length ? failing.slice(0, maxFailing).map(line) : ["  none"]),
    ...(perfect.length ? ["", "Perfect scores:", ...perfect.slice(0, maxPerfect).map(line)] : []),
    "",
    SITE,
    ...(unsubscribeUrl ? [`Unsubscribe: ${unsubscribeUrl}`] : []),
  ].join("\n");

  return { subject, html, text };
}
