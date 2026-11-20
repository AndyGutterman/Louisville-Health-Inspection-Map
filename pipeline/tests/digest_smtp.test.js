/**
 * tests/digest_smtp.test.js — the list headers on each email (digest/smtp.js): the
 * unsubscribe link Gmail and Outlook show, and the one-click unsubscribe behind
 * ONE_CLICK_UNSUBSCRIBE (docs/DIGEST.md, "Landing in spam").
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { listHeaders } from "../digest/smtp.js";

const EMAIL = {
  unsubscribeUrl: "https://example.test/?unsubscribe=tok",
  unsubscribeToken: "tok",
};
const ON = { ONE_CLICK_UNSUBSCRIBE: "on", SUPABASE_URL: "https://proj.supabase.co/" };

describe("listHeaders", () => {
  it("names the list and links the site's unsubscribe page", () => {
    assert.deepEqual(listHeaders(EMAIL, {}), {
      "List-Id": "Louisville Food Safe <email.louisvillefoodsafe.netlify.app>",
      "List-Unsubscribe": "<https://example.test/?unsubscribe=tok>",
    });
  });

  it("points at the unsubscribe function, for one click, once it is switched on", () => {
    const h = listHeaders(EMAIL, ON);
    // RFC 8058: exactly one HTTPS link, the one that takes the POST.
    assert.equal(
      h["List-Unsubscribe"],
      "<https://proj.supabase.co/functions/v1/unsubscribe?token=tok>",
    );
    assert.equal(h["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  });

  it("escapes the token", () => {
    const h = listHeaders({ ...EMAIL, unsubscribeToken: "a b&c" }, ON);
    assert.match(h["List-Unsubscribe"], /token=a%20b%26c>/);
  });

  it("stays off for anything but 'on', and without the database's address", () => {
    for (const env of [
      { ONE_CLICK_UNSUBSCRIBE: "", SUPABASE_URL: ON.SUPABASE_URL },
      { ONE_CLICK_UNSUBSCRIBE: "true", SUPABASE_URL: ON.SUPABASE_URL },
      { ONE_CLICK_UNSUBSCRIBE: "on" },
    ]) {
      assert.equal(listHeaders(EMAIL, env)["List-Unsubscribe-Post"], undefined);
    }
  });

  it("adds nothing to an email with no unsubscribe link", () => {
    assert.deepEqual(listHeaders({ unsubscribeUrl: null, unsubscribeToken: null }, ON), {});
  });
});
