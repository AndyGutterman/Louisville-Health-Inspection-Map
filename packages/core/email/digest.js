/**
 * email/digest.js — the weekly digest email, from get_whats_new rows. Pure: no network,
 * no clock (the caller passes `today`), so it can be tested, and previewed in the browser
 * (the site's email admin page) exactly as the pipeline sends it.
 */
import { FAIL_SCORE, isFailing } from "../grading.js";
import { countyName as regionName } from "../regions.js";
import {
  SITE,
  TEXT,
  DIM,
  GREEN,
  AMBER,
  RED,
  PLAIN,
  RULE,
  esc,
  plural,
  mapButton,
  footerLinks,
  page,
} from "./theme.js";

export { SITE, FAIL_SCORE };

const isC = (r) => String(r.grade ?? "").toUpperCase() === "C";
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

/** The first day (YYYY-MM-DD) of a digest covering `days` days up to and including `today`. */
export const windowStart = (today, days = 7) => daysBefore(today, days - 1);

/**
 * PostgREST filter (for .or()) keeping get_whats_new rows from `since` on, so a reader
 * downloads the digest's window and not the function's whole 30 days. Undated rows go by
 * the day they were posted, as in summarize.
 */
export const sinceFilter = (since) =>
  `inspection_date.gte.${since},and(inspection_date.is.null,posted_date.gte.${since})`;

// The columns of get_whats_new the email reads.
export const DIGEST_COLUMNS =
  "establishment_id,premise_name,address,score,grade,inspection_date,violation_count,region,posted_date";

/**
 * What the email says, as data. rows: get_whats_new(limit_n) rows over any window; this
 * keeps the last `days` up to and including `today` (YYYY-MM-DD).
 */
export function summarize(rows, { today, days = 7 }) {
  const since = windowStart(today, days);
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

/**
 * digest_watch_areas rows (one per place, the area's details and totals repeated on each;
 * an area with nothing inspected is one row with no place) -> Map of user id -> that
 * person's watch areas, in the order the rows came:
 *   [{ id, name, radius, total, failing, places: [row, ...] }]
 */
export function groupWatchAreas(rows) {
  const byUser = new Map();
  const byArea = new Map();
  for (const r of rows || []) {
    let area = byArea.get(r.area_id);
    if (!area) {
      area = {
        id: r.area_id,
        name: (r.label || r.center_address || "Watch area").trim(),
        radius: r.radius_miles,
        total: Number(r.area_total ?? 0),
        failing: Number(r.area_failing ?? 0),
        places: [],
      };
      byArea.set(r.area_id, area);
      if (!byUser.has(r.user_id)) byUser.set(r.user_id, []);
      byUser.get(r.user_id).push(area);
    }
    if (r.establishment_id != null) area.places.push(r);
  }
  return byUser;
}

const placeLink = (r) => `${SITE}/?eid=${encodeURIComponent(r.establishment_id)}`;

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

const scoreColour = (r) => (isC(r) ? RED : isFailing(r) ? AMBER : r.score === 100 ? GREEN : PLAIN);
const areaCounts = (a) =>
  a.total
    ? `${plural(a.total, "inspection")} this week, ${a.failing ? `${a.failing} failing` : "none failing"}`
    : "No inspections here this week.";

// One watch area, as its own block: a title bar, its counts, then its places.
function watchAreaSection(a) {
  const rows = a.places.map((r) => placeRow(r, scoreColour(r))).join("");
  const more =
    a.total > a.places.length
      ? `<tr><td style="padding:8px 0 0;border-top:${RULE};"><a href="${SITE}" style="color:${GREEN};font-size:13px;">and ${a.total - a.places.length} more on the map →</a></td></tr>`
      : "";
  return `
    <tr><td style="padding:18px 0 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:rgba(249,115,22,0.07);border:1px solid rgba(249,115,22,0.28);border-radius:12px;">
        <tr><td style="padding:14px 16px ${rows ? "6px" : "14px"};">
          <div style="font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:${AMBER};">Your watch area · ${esc(a.radius)} mi</div>
          <div style="font-size:17px;font-weight:800;margin-top:4px;line-height:1.3;">${esc(a.name)}</div>
          <div style="color:${DIM};font-size:13px;margin-top:2px;${rows ? "padding-bottom:10px;" : ""}">${esc(areaCounts(a))}</div>
          ${rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}${more}</table>` : ""}
        </td></tr>
      </table>
    </td></tr>`;
}

function section(title, rowsHtml) {
  return `
    <tr><td style="padding:22px 0 6px;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:${DIM};">${esc(title)}</td></tr>
    <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table></td></tr>`;
}

/**
 * The email: { subject, html, text }. unsubscribeUrl is per recipient; null for a preview.
 * areas: the recipient's watch areas (groupWatchAreas); each is its own part of the
 * email, above the part everyone gets. test: marks the subject, for a test send.
 */
export function renderDigest(
  summary,
  { unsubscribeUrl = null, maxFailing = 25, maxPerfect = 8, areas = [], test = false } = {},
) {
  const { total, byRegion, failing, perfect, since, today } = summary;
  const counts = Object.entries(byRegion)
    .map(([region, n]) => `${n} in ${regionName(region)}`)
    .join(", ");
  const range = `${shortDate(since)} – ${shortDate(today)}`;
  const subject = `${test ? "[Test] " : ""}${plural(total, "inspection")} this week, ${failing.length} failing · Louisville Food Safe`;
  const areasHtml = areas.map(watchAreaSection).join("");
  // With watch areas above it, the shared part gets its own heading.
  const everywhere = areas.length
    ? `<tr><td style="padding:26px 0 0;font-size:17px;font-weight:800;">Everywhere this week</td></tr>`
    : "";

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
  const html = page({
    title: subject,
    header: `<div style="font-size:22px;font-weight:800;margin-top:10px;line-height:1.25;">${plural(total, "inspection")} this week</div>
  <div style="color:${DIM};font-size:13px;margin-top:4px;">${esc(range)}${counts ? ` · ${esc(counts)}` : ""}</div>`,
    rows: `${areasHtml}${everywhere}
  ${section(`Scored under ${FAIL_SCORE} or a C placard`, failingHtml + more)}
  ${perfect.length ? section("Perfect scores", perfectHtml) : ""}
  ${mapButton()}
  <tr><td style="padding:22px 0 0;color:${DIM};font-size:11px;line-height:1.6;text-align:center;">
    Scores and placards are the health departments' own. Bullitt County publishes no dates or placards.<br>${footerLinks(unsubscribeUrl)}<br>Louisville Food Safe · Louisville, KY
  </td></tr>`,
  });

  const line = (r) =>
    `  ${r.score ?? "–"}${r.grade ? ` (${r.grade})` : ""}  ${r.premise_name}, ${r.address}`;
  const text = [
    `Louisville Food Safe: ${plural(total, "inspection")} this week (${range})${counts ? `, ${counts}` : ""}`,
    ...areas.flatMap((a) => [
      "",
      `Your watch area: ${a.name} (${a.radius} mi). ${areaCounts(a)}`,
      ...a.places.map(line),
      ...(a.total > a.places.length ? [`  and ${a.total - a.places.length} more on the map`] : []),
    ]),
    "",
    `${areas.length ? "Everywhere. " : ""}Scored under ${FAIL_SCORE} or a C placard:`,
    ...(failing.length ? failing.slice(0, maxFailing).map(line) : ["  none"]),
    ...(perfect.length ? ["", "Perfect scores:", ...perfect.slice(0, maxPerfect).map(line)] : []),
    "",
    SITE,
    ...(unsubscribeUrl ? [`Unsubscribe: ${unsubscribeUrl}`] : []),
  ].join("\n");

  return { subject, html, text };
}
