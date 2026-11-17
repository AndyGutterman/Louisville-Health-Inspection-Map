// Links into the site from the digest email: /?eid=<establishment id> opens that place,
// /?page=learn opens the Learn page. /?page=admin opens the email admin page (a bookmark
// for the owner; it shows nothing to anyone else). Pure: Map.jsx applies the result and
// cleans the URL.

const PAGES = ["learn", "admin"];

/**
 * @param {string} search  window.location.search
 * @returns {{ eid: string|null, page: "learn"|"admin"|null, rest: string }} rest: the remaining query
 *   string without a leading "?", so the URL can be rewritten without these parameters.
 */
export function parseDeepLink(search) {
  const params = new URLSearchParams(search);
  const eid = params.get("eid") || null;
  const page = PAGES.includes(params.get("page")) ? params.get("page") : null;
  params.delete("eid");
  params.delete("page");
  return { eid, page, rest: params.toString() };
}
