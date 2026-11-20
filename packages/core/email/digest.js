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
  mapButton,
  footerLinks,
  page,
} from "./theme.js";
import { count, localeFor, wordsFor } from "./words.js";

export { SITE, FAIL_SCORE };

const isC = (r) => String(r.grade ?? "").toUpperCase() === "C";
const dateOf = (r) => r.inspection_date ?? r.posted_date ?? null;
const daysBefore = (today, days) => {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};
const shortDate = (iso, lang = "en") =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(localeFor(lang), {
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
        unnamed: !(r.label || r.center_address), // the email says "Watch area" in its language
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

function placeRow(r, colour, lang) {
  const w = wordsFor(lang);
  const when = dateOf(r) ? shortDate(dateOf(r), lang) : "";
  const viol = r.violation_count > 0 ? count(lang, r.violation_count, "violation") : "";
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
        ${r.grade ? `<div style="color:${DIM};font-size:12px;margin-top:4px;text-align:center;">${esc(w.placard(r.grade))}</div>` : ""}
      </td>
    </tr>`;
}

const scoreColour = (r) => (isC(r) ? RED : isFailing(r) ? AMBER : r.score === 100 ? GREEN : PLAIN);
const shownAbove = (n, lang) => (n ? wordsFor(lang).shownAbove(n) : "");
const areaCounts = (a, lang) => {
  const w = wordsFor(lang);
  return a.total
    ? `${w.areaCounts(count(lang, a.total, "inspection"), a.failing)}${shownAbove(a.above, lang)}`
    : w.areaNone;
};
// Places in the area that the email doesn't list: past its top few, not counting those
// listed above (oncePerEmail).
const areaMore = (a) => Math.max(0, a.total - a.places.length - (a.above ?? 0));
// "1 of your 12 saved places was inspected this week." A named list (one day, several per
// account) says "places in this list"; one listed in an earlier list counts as shown above.
const savedCounts = (l, lang) => {
  const w = wordsFor(lang);
  const inspected = l.places.length + (l.above ?? 0);
  const what = l.name
    ? w.savedWhatList(count(lang, l.total, "place"))
    : w.savedWhatYours(count(lang, l.total, "savedPlace"));
  if (!inspected) return w.savedNone(what, l.total);
  return `${w.savedSome(inspected, what)}${shownAbove(l.above, lang)}`;
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
function savedSection(l, lang) {
  const w = wordsFor(lang);
  return personalBox({
    label: l.name ? w.labelList : w.labelSaved,
    accent: GREEN,
    tint: { bg: "rgba(52,168,83,0.07)", border: "rgba(52,168,83,0.28)" },
    title: l.name ?? "",
    counts: savedCounts(l, lang),
    rows: l.places.map((r) => placeRow(r, scoreColour(r), lang)).join(""),
  });
}

// One watch area, as its own block: a title bar, its counts, then its places.
function watchAreaSection(a, lang) {
  const w = wordsFor(lang);
  const more = areaMore(a)
    ? `<tr><td style="padding:8px 0 0;border-top:${RULE};"><a href="${SITE}" style="color:${GREEN};font-size:13px;">${w.moreOnMap(areaMore(a))}</a></td></tr>`
    : "";
  return personalBox({
    label: w.labelArea(a.radius),
    accent: AMBER,
    tint: { bg: "rgba(249,115,22,0.07)", border: "rgba(249,115,22,0.28)" },
    title: a.unnamed ? w.watchArea : a.name,
    counts: areaCounts(a, lang),
    rows: a.places.map((r) => placeRow(r, scoreColour(r), lang)).join(""),
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
    lang = "en",
  } = {},
) {
  const w = wordsFor(lang);
  const { total, byRegion, since, today } = summary;
  const counts = Object.entries(byRegion)
    .map(([region, n]) => w.inRegion(n, regionName(region)))
    .join(", ");
  const range = `${shortDate(since, lang)} – ${shortDate(today, lang)}`;
  const inspections = count(lang, total, "inspection");
  // The subject counts every failing inspection, including any listed in a personal part.
  const subject = `${test ? w.test : ""}${w.digestSubject(inspections, summary.failing.length)}`;

  const mine = oncePerEmail({
    saved: (saved ?? []).filter((l) => l.total > 0),
    areas,
    failing: summary.failing,
    perfect: summary.perfect,
  });
  const { failing, perfect, failingAbove } = mine;
  const personalHtml =
    mine.saved.map((l) => savedSection(l, lang)).join("") +
    mine.areas.map((a) => watchAreaSection(a, lang)).join("");
  // With personal parts above it, the shared part gets its own heading.
  const everywhere = personalHtml
    ? `<tr><td style="padding:26px 0 0;font-size:17px;font-weight:800;">${w.everywhere}</td></tr>`
    : "";

  const failingHtml = failing.length
    ? failing
        .slice(0, maxFailing)
        .map((r) => placeRow(r, isC(r) ? RED : AMBER, lang))
        .join("")
    : `<tr><td style="padding:10px 0;color:${DIM};font-size:14px;">${
        failingAbove
          ? w.onlyShownAbove(count(lang, failingAbove, "place"))
          : w.nothingUnder(FAIL_SCORE)
      }</td></tr>`;
  const more =
    failing.length > maxFailing
      ? `<tr><td style="padding:8px 0;"><a href="${SITE}" style="color:${GREEN};font-size:13px;">${w.moreOnMap(failing.length - maxFailing)}</a></td></tr>`
      : "";
  const perfectHtml = perfect
    .slice(0, maxPerfect)
    .map((r) => placeRow(r, GREEN, lang))
    .join("");
  const html = page({
    title: subject,
    header: `<div style="font-size:22px;font-weight:800;margin-top:10px;line-height:1.25;">${esc(w.inspectionsThisWeek(total, inspections))}</div>
  <div style="color:${DIM};font-size:13px;margin-top:4px;">${esc(range)}${counts ? ` · ${esc(counts)}` : ""}</div>`,
    rows: `${personalHtml}${everywhere}
  ${section(`${w.failingTitle(FAIL_SCORE)}${shownAbove(failingAbove && failing.length ? failingAbove : 0, lang)}`, failingHtml + more)}
  ${perfect.length ? section(w.perfectTitle, perfectHtml) : ""}
  ${mapButton(w.openMap)}
  <tr><td style="padding:22px 0 0;color:${DIM};font-size:11px;line-height:1.6;text-align:center;">
    ${esc(w.disclaimer)}<br>${unsubscribeUrl ? `${esc(w.why)}<br>` : ""}${footerLinks(unsubscribeUrl, lang)}<br>Louisville Food Safe · Louisville, KY
  </td></tr>`,
    lang,
  });

  const line = (r) =>
    `  ${r.score ?? "–"}${r.grade ? ` (${r.grade})` : ""}  ${r.premise_name}, ${r.address}`;
  const text = [
    w.textHead(inspections, range, counts),
    ...mine.saved.flatMap((l) => [
      "",
      w.textList(l.name, savedCounts(l, lang)),
      ...l.places.map(line),
    ]),
    ...mine.areas.flatMap((a) => [
      "",
      w.textArea(a.unnamed ? w.watchArea : a.name, a.radius, areaCounts(a, lang)),
      ...a.places.map(line),
      ...(areaMore(a) ? [`  ${w.moreOnMapText(areaMore(a))}`] : []),
    ]),
    "",
    w.textFailingHead(personalHtml ? w.everywhereText : "", FAIL_SCORE),
    ...(failing.length
      ? failing.slice(0, maxFailing).map(line)
      : [failingAbove ? w.onlyThoseAbove : w.none]),
    ...(perfect.length ? ["", w.textPerfectHead, ...perfect.slice(0, maxPerfect).map(line)] : []),
    "",
    SITE,
    ...(unsubscribeUrl ? [w.unsubscribeText(unsubscribeUrl)] : []),
  ].join("\n");

  return { subject, html, text };
}
