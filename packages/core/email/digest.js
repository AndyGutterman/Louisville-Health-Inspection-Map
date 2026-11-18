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

/**
 * digest_saved_places rows (one per saved place inspected in the window, with its list's
 * count of places; a list with none inspected is one row with no place) -> Map of user id
 * -> that person's lists, in the order the rows came:
 *   [{ id, name, total, places: [row, ...] }]
 * Today each account has one list (id and name null: "Your saved places"); the shape is
 * ready for several (migration 20261128000000).
 */
export function groupSavedPlaces(rows) {
  const byUser = new Map();
  const byList = new Map();
  for (const r of rows || []) {
    const key = `${r.user_id}|${r.list_id ?? ""}`;
    let list = byList.get(key);
    if (!list) {
      list = {
        id: r.list_id ?? null,
        name: r.list_name?.trim() || null,
        total: Number(r.saved_total ?? 0),
        places: [],
      };
      byList.set(key, list);
      if (!byUser.has(r.user_id)) byUser.set(r.user_id, []);
      byUser.get(r.user_id).push(list);
    }
    if (r.establishment_id != null) list.places.push(r);
  }
  return byUser;
}

/**
 * The parts of one person's email that are theirs, with each place named once, in the
 * order they appear: their saved lists, then their watch areas, then the shared lists. A
 * place goes in the first part that has it and is left out after; `above` counts what a
 * part leaves out for that reason, so its totals still add up.
 *   saved: [list] (groupSavedPlaces); areas: [area]; failing, perfect: the shared lists
 */
export function oncePerEmail({ saved = [], areas = [], failing = [], perfect = [] }) {
  const shown = new Set();
  const take = (rows) => {
    const kept = rows.filter((r) => !shown.has(r.establishment_id));
    for (const r of kept) shown.add(r.establishment_id);
    return { kept, above: rows.length - kept.length };
  };
  const listParts = saved.map((l) => {
    const { kept, above } = take(l.places);
    return { ...l, places: kept, above };
  });
  const areaParts = areas.map((a) => {
    const { kept, above } = take(a.places);
    return { ...a, places: kept, above };
  });
  // The shared lists only drop what the personal parts showed (they don't dedupe each
  // other: a place can't be both failing and perfect).
  const personal = new Set(shown);
  const drop = (rows) => rows.filter((r) => !personal.has(r.establishment_id));
  return {
    saved: listParts,
    areas: areaParts,
    failing: drop(failing),
    failingAbove: failing.length - drop(failing).length,
    perfect: drop(perfect),
  };
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
const shownAbove = (n) => (n ? ` (${n} shown above)` : "");
const areaCounts = (a) =>
  a.total
    ? `${plural(a.total, "inspection")} this week, ${a.failing ? `${a.failing} failing` : "none failing"}${shownAbove(a.above)}`
    : "No inspections here this week.";
// Places in the area that the email doesn't list: past its top few, not counting those
// listed above (oncePerEmail).
const areaMore = (a) => Math.max(0, a.total - a.places.length - (a.above ?? 0));
// "1 of your 12 saved places was inspected this week." A named list (one day, several per
// account) says "places in this list"; one listed in an earlier list counts as shown above.
const savedCounts = (l) => {
  const inspected = l.places.length + (l.above ?? 0);
  const what = l.name
    ? `${plural(l.total, "place")} in this list`
    : `your ${plural(l.total, "saved place")}`;
  if (!inspected) return `None of ${what} ${l.total === 1 ? "was" : "were"} inspected this week.`;
  return `${inspected} of ${what} ${inspected === 1 ? "was" : "were"} inspected this week.${shownAbove(l.above)}`;
};

// A personal part of the email (the saved places, a watch area): a tinted box with a
// label, a title, a line of counts, then its places.
function personalBox({ label, accent, tint, title, counts, rows, more = "" }) {
  return `
    <tr><td style="padding:18px 0 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${tint.bg};border:1px solid ${tint.border};border-radius:12px;">
        <tr><td style="padding:14px 16px ${rows ? "6px" : "14px"};">
          <div style="font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:${accent};">${esc(label)}</div>
          ${title ? `<div style="font-size:17px;font-weight:800;margin-top:4px;line-height:1.3;">${esc(title)}</div>` : ""}
          <div style="color:${DIM};font-size:13px;margin-top:2px;${rows ? "padding-bottom:10px;" : ""}">${esc(counts)}</div>
          ${rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}${more}</table>` : ""}
        </td></tr>
      </table>
    </td></tr>`;
}

// One of the recipient's saved lists, with its places inspected this week. Today the one
// list is unnamed ("Your saved places"); a named list (one day) shows its name.
function savedSection(l) {
  return personalBox({
    label: l.name ? "Your list" : "Your saved places",
    accent: GREEN,
    tint: { bg: "rgba(52,168,83,0.07)", border: "rgba(52,168,83,0.28)" },
    title: l.name ?? "",
    counts: savedCounts(l),
    rows: l.places.map((r) => placeRow(r, scoreColour(r))).join(""),
  });
}

// One watch area, as its own block: a title bar, its counts, then its places.
function watchAreaSection(a) {
  const more = areaMore(a)
    ? `<tr><td style="padding:8px 0 0;border-top:${RULE};"><a href="${SITE}" style="color:${GREEN};font-size:13px;">and ${areaMore(a)} more on the map →</a></td></tr>`
    : "";
  return personalBox({
    label: `Your watch area · ${a.radius} mi`,
    accent: AMBER,
    tint: { bg: "rgba(249,115,22,0.07)", border: "rgba(249,115,22,0.28)" },
    title: a.name,
    counts: areaCounts(a),
    rows: a.places.map((r) => placeRow(r, scoreColour(r))).join(""),
    more,
  });
}

function section(title, rowsHtml) {
  return `
    <tr><td style="padding:22px 0 6px;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:${DIM};">${esc(title)}</td></tr>
    <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table></td></tr>`;
}

/**
 * The email: { subject, html, text }. unsubscribeUrl is per recipient; null for a preview.
 * saved: the recipient's saved places inspected this week (groupSavedPlaces), first;
 * areas: their watch areas (groupWatchAreas), each its own part; both above the part
 * everyone gets. A place is named once (oncePerEmail). test: marks the subject.
 */
export function renderDigest(
  summary,
  {
    unsubscribeUrl = null,
    maxFailing = 25,
    maxPerfect = 8,
    saved = [],
    areas = [],
    test = false,
  } = {},
) {
  const { total, byRegion, since, today } = summary;
  const counts = Object.entries(byRegion)
    .map(([region, n]) => `${n} in ${regionName(region)}`)
    .join(", ");
  const range = `${shortDate(since)} – ${shortDate(today)}`;
  // The subject counts every failing inspection, including any listed in a personal part.
  const subject = `${test ? "[Test] " : ""}${plural(total, "inspection")} this week, ${summary.failing.length} failing · Louisville Food Safe`;

  const mine = oncePerEmail({
    saved: (saved ?? []).filter((l) => l.total > 0),
    areas,
    failing: summary.failing,
    perfect: summary.perfect,
  });
  const { failing, perfect, failingAbove } = mine;
  const personalHtml =
    mine.saved.map(savedSection).join("") + mine.areas.map(watchAreaSection).join("");
  // With personal parts above it, the shared part gets its own heading.
  const everywhere = personalHtml
    ? `<tr><td style="padding:26px 0 0;font-size:17px;font-weight:800;">Everywhere this week</td></tr>`
    : "";

  const failingHtml = failing.length
    ? failing
        .slice(0, maxFailing)
        .map((r) => placeRow(r, isC(r) ? RED : AMBER))
        .join("")
    : `<tr><td style="padding:10px 0;color:${DIM};font-size:14px;">${
        failingAbove
          ? `Only the ${plural(failingAbove, "place")} shown above.`
          : `Nothing scored under ${FAIL_SCORE} this week.`
      }</td></tr>`;
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
    rows: `${personalHtml}${everywhere}
  ${section(`Scored under ${FAIL_SCORE} or a C placard${shownAbove(failingAbove && failing.length ? failingAbove : 0)}`, failingHtml + more)}
  ${perfect.length ? section("Perfect scores", perfectHtml) : ""}
  ${mapButton()}
  <tr><td style="padding:22px 0 0;color:${DIM};font-size:11px;line-height:1.6;text-align:center;">
    Scores and placards are the health departments' own. Bullitt and Oldham counties post scores, not placards.<br>${footerLinks(unsubscribeUrl)}<br>Louisville Food Safe · Louisville, KY
  </td></tr>`,
  });

  const line = (r) =>
    `  ${r.score ?? "–"}${r.grade ? ` (${r.grade})` : ""}  ${r.premise_name}, ${r.address}`;
  const text = [
    `Louisville Food Safe: ${plural(total, "inspection")} this week (${range})${counts ? `, ${counts}` : ""}`,
    ...mine.saved.flatMap((l) => [
      "",
      `${l.name ? `Your list: ${l.name}.` : "Your saved places:"} ${savedCounts(l)}`,
      ...l.places.map(line),
    ]),
    ...mine.areas.flatMap((a) => [
      "",
      `Your watch area: ${a.name} (${a.radius} mi). ${areaCounts(a)}`,
      ...a.places.map(line),
      ...(areaMore(a) ? [`  and ${areaMore(a)} more on the map`] : []),
    ]),
    "",
    `${personalHtml ? "Everywhere. " : ""}Scored under ${FAIL_SCORE} or a C placard:`,
    ...(failing.length
      ? failing.slice(0, maxFailing).map(line)
      : [failingAbove ? "  only those shown above" : "  none"]),
    ...(perfect.length ? ["", "Perfect scores:", ...perfect.slice(0, maxPerfect).map(line)] : []),
    "",
    SITE,
    ...(unsubscribeUrl ? [`Unsubscribe: ${unsubscribeUrl}`] : []),
  ].join("\n");

  return { subject, html, text };
}
