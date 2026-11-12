/**
 * regions/kyportal/fetch.js — downloads one county's page from Kentucky's public
 * inspection portal (public.cdpehs.com/KYEnvPBL, the page county health departments link
 * to as "View Food Scores"). parse.js turns the page into establishments.
 *
 * The portal is an ASP.NET page, not an API:
 *   1. GET ...?County=<n> redirects to a session URL (/KYEnvPBL/(S(abc123))/...). The
 *      session lives in that URL, not in a cookie, so step 2 must go to the same URL.
 *   2. The table shows 10 rows a page. Posting the page's own form back with the page
 *      size set to 999 (the most it allows) returns the whole county at once.
 * So a county costs two requests. This never loops: a county with more places than fit on
 * one page is refused (see MAX_ROWS) until paging is built and tested.
 */

const PAGE_URL =
  "https://public.cdpehs.com/KYEnvPBL/VW_PUBLIC_EST_INSP/ShowVW_PUBLIC_EST_INSPTable.aspx";
const PAGINATION = "ctl00$PageContent$VW_PUBLIC_EST_INSPPagination$";
export const MAX_ROWS = 999; // the portal's largest page size
const TIMEOUT_MS = 60_000;
// The portal answers browsers; nothing here identifies the site or its owner.
const HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
};

const decodeAttr = (v) =>
  v
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/**
 * The form a browser would send back for this page: every hidden and text input, as
 * [name, value] pairs. Pure.
 */
export function formFields(html) {
  const fields = [];
  for (const [tag] of html.matchAll(/<input\b[^>]*>/g)) {
    const type = tag.match(/\btype="([^"]*)"/)?.[1];
    const name = tag.match(/\bname="([^"]*)"/)?.[1];
    if (!name || (type !== "hidden" && type !== "text")) continue;
    fields.push([name, decodeAttr(tag.match(/\bvalue="([^"]*)"/)?.[1] ?? "")]);
  }
  return fields;
}

/** The form body that asks for `size` rows a page (the "Page" link beside the size box). Pure. */
export function pageSizeForm(html, size = MAX_ROWS) {
  const form = new URLSearchParams(formFields(html));
  if (!form.has("__VIEWSTATE")) throw new Error("The portal page has no form state to send back");
  form.set(`${PAGINATION}_PageSize`, String(size));
  form.set("__EVENTTARGET", `${PAGINATION}_PageSizeButton`);
  form.set("__EVENTARGUMENT", "");
  return form;
}

async function request(fetchImpl, url, init) {
  const res = await fetchImpl(url, {
    ...init,
    headers: { ...HEADERS, ...init?.headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Portal answered ${res.status} for ${url}`);
  return res;
}

/**
 * Every row of one county, as the page's HTML. `countyNumber` is the county's place in
 * the alphabetical list of Kentucky's 120 counties (Bullitt 15, Oldham 93).
 * Two requests, always.
 */
export async function fetchCountyPage(countyNumber, { fetchImpl = fetch } = {}) {
  if (!Number.isInteger(countyNumber) || countyNumber < 1 || countyNumber > 120) {
    throw new Error(`County number must be 1 to 120, got ${countyNumber}`);
  }
  const first = await request(fetchImpl, `${PAGE_URL}?County=${countyNumber}`);
  const sessionUrl = first.url; // after the redirect: carries the session
  const form = pageSizeForm(await first.text());
  const all = await request(fetchImpl, sessionUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", referer: sessionUrl },
    body: form.toString(),
  });
  return all.text();
}
