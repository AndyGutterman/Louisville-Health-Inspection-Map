// Links into the site from the digest email: /?eid=<establishment id> opens that place,
// /?page=learn opens the Learn page. Pure: Map.jsx applies the result and cleans the URL.

/**
 * @param {string} search  window.location.search
 * @returns {{ eid: string|null, page: "learn"|null, rest: string }} rest: the remaining query
 *   string without a leading "?", so the URL can be rewritten without these parameters.
 */
export function parseDeepLink(search) {
  const params = new URLSearchParams(search);
  const eid = params.get("eid") || null;
  const page = params.get("page") === "learn" ? "learn" : null;
  params.delete("eid");
  params.delete("page");
  return { eid, page, rest: params.toString() };
}
