// Answers the app's Supabase REST calls (/rest/v1/...) from fixtures.js, so the tests
// never touch a real database and always see the same data. Works for any Supabase
// URL, which means the same tests run against a Netlify deploy preview (real project
// URL baked in) and a local build (dummy URL).
//
// Supported: pagination (offset/limit), `col=eq.value` filters, and row counts via the
// Content-Range header (what supabase-js reads for { count: "exact" }). Other filters
// are ignored and return every row. Requests for anything not in TABLES are answered
// with [] and recorded in `unmocked`, so a test can fail when the app starts calling
// something new.
import { TABLES } from "./fixtures.js";

const ALLOW_HEADERS =
  "authorization, apikey, content-type, prefer, range, accept, accept-profile, content-profile, x-client-info";

function corsHeaders(request) {
  return {
    "access-control-allow-origin": request.headers()["origin"] || "*",
    "access-control-allow-headers": ALLOW_HEADERS,
    "access-control-allow-methods": "GET, POST, HEAD, PATCH, DELETE, OPTIONS",
    "access-control-expose-headers": "content-range",
  };
}

const NOT_FILTERS = new Set(["select", "order", "offset", "limit", "on_conflict", "columns"]);

function applyEqFilters(rows, params) {
  let out = rows;
  for (const [col, value] of params) {
    if (NOT_FILTERS.has(col) || !value.startsWith("eq.")) continue;
    const want = value.slice(3);
    out = out.filter((r) => String(r[col]) === want);
  }
  return out;
}

// holds: { path: Promise } keeps those responses back until the promise settles, to test
// what shows while data is still loading.
// failOnce: [path] answers the first request for each path with a 503, to test retries.
export async function mockSupabase(page, { holds = {}, failOnce = [] } = {}) {
  const unmocked = [];
  const toFail = new Set(failOnce);

  await page.route(/\/rest\/v1\//, async (route) => {
    const request = route.request();
    const cors = corsHeaders(request);
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }

    const url = new URL(request.url());
    const path = url.pathname.replace(/^.*\/rest\/v1\//, "");
    const table = TABLES[path];
    if (!table) unmocked.push(`${request.method()} ${path}`);

    if (holds[path]) await holds[path];
    if (toFail.delete(path)) {
      await route.fulfill({
        status: 503,
        headers: { ...cors, "content-type": "application/json" },
        body: JSON.stringify({ message: "Service unavailable (test)" }),
      });
      return;
    }
    const rows = applyEqFilters(table ?? [], url.searchParams);
    const offset = Number(url.searchParams.get("offset") || 0);
    const limit = url.searchParams.get("limit");
    const pageRows =
      limit == null ? rows.slice(offset) : rows.slice(offset, offset + Number(limit));
    const range = pageRows.length ? `${offset}-${offset + pageRows.length - 1}` : "*";

    await route.fulfill({
      status: 200,
      headers: {
        ...cors,
        "content-type": "application/json; charset=utf-8",
        "content-range": `${range}/${rows.length}`,
      },
      body: request.method() === "HEAD" ? "" : JSON.stringify(pageRows),
    });
  });

  return { unmocked };
}
