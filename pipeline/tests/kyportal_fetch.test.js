/**
 * tests/kyportal_fetch.test.js — the two requests that download a county from Kentucky's
 * inspection portal. No network: fetch is replaced by a stand-in that records the calls.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MAX_ROWS, fetchCountyPage, formFields, pageSizeForm } from "../regions/kyportal/fetch.js";

const PAGE = readFileSync(new URL("./fixtures/kyportal_oldham.html", import.meta.url), "utf8");
const SIZE = "ctl00$PageContent$VW_PUBLIC_EST_INSPPagination$_PageSize";

describe("formFields", () => {
  it("collects hidden and text inputs, decoded, and skips buttons", () => {
    const fields = new Map(formFields(PAGE));
    assert.equal(fields.get("__VIEWSTATE"), "/wEPDwUKfixture+state==");
    assert.equal(fields.get(SIZE), "10");
    assert.equal(fields.get("ctl00$PageContent$PREMISE_NAMEFilter"), ""); // no value attribute
    assert.match(fields.get("isd_geo_location"), /^<location> <error>/);
    assert.ok(![...fields.keys()].some((k) => k.endsWith("_NextPage")), "image buttons not sent");
  });
});

describe("pageSizeForm", () => {
  it("asks for the largest page through the page-size button", () => {
    const form = pageSizeForm(PAGE);
    assert.equal(form.get(SIZE), String(MAX_ROWS));
    assert.equal(
      form.get("__EVENTTARGET"),
      "ctl00$PageContent$VW_PUBLIC_EST_INSPPagination$_PageSizeButton",
    );
    assert.equal(form.get("__VIEWSTATE"), "/wEPDwUKfixture+state==");
  });

  it("refuses a page with no form state (an error page)", () => {
    assert.throws(() => pageSizeForm("<html>Server Error</html>"), /no form state/);
  });
});

describe("fetchCountyPage", () => {
  const SESSION =
    "https://public.cdpehs.com/KYEnvPBL/(S(abc123))/VW_PUBLIC_EST_INSP/ShowVW_PUBLIC_EST_INSPTable.aspx?County=93";

  function fakeFetch({ status = 200 } = {}) {
    const calls = [];
    const fetchImpl = async (url, init = {}) => {
      calls.push({ url, method: init.method ?? "GET", body: init.body, headers: init.headers });
      return {
        ok: status === 200,
        status,
        url: SESSION, // where the redirect ended up
        text: async () => (calls.length === 1 ? PAGE : "<html>ALL ROWS</html>"),
      };
    };
    return { calls, fetchImpl };
  }

  it("makes exactly two requests, the second to the session URL from the first", async () => {
    const { calls, fetchImpl } = fakeFetch();
    const html = await fetchCountyPage(93, { fetchImpl });
    assert.equal(html, "<html>ALL ROWS</html>");
    assert.equal(calls.length, 2);
    assert.deepEqual([calls[0].method, calls[1].method], ["GET", "POST"]);
    assert.match(calls[0].url, /ShowVW_PUBLIC_EST_INSPTable\.aspx\?County=93$/);
    assert.equal(calls[1].url, SESSION);
    assert.equal(new URLSearchParams(calls[1].body).get(SIZE), "999");
  });

  it("sends nothing that names this site", async () => {
    const { calls, fetchImpl } = fakeFetch();
    await fetchCountyPage(93, { fetchImpl });
    for (const call of calls) {
      assert.doesNotMatch(JSON.stringify(call.headers), /food ?safe|louisville|github/i);
    }
  });

  it("refuses a county number outside 1 to 120 without asking the portal", async () => {
    const { calls, fetchImpl } = fakeFetch();
    for (const bad of [0, 121, 9.5, "93", undefined]) {
      await assert.rejects(fetchCountyPage(bad, { fetchImpl }), /County number must be 1 to 120/);
    }
    assert.equal(calls.length, 0);
  });

  it("stops at the first request when the portal answers with an error", async () => {
    const { calls, fetchImpl } = fakeFetch({ status: 503 });
    await assert.rejects(fetchCountyPage(93, { fetchImpl }), /Portal answered 503/);
    assert.equal(calls.length, 1);
  });
});
