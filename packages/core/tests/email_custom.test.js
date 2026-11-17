/**
 * tests/email_custom.test.js — a one-off message from the email admin page: plain text
 * in, the site's email card out, and nothing typed is ever treated as HTML.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { messageHtml, renderCustom } from "@lfs/core/email/custom.js";

describe("messageHtml", () => {
  it("makes a paragraph of each block and keeps single line breaks", () => {
    const html = messageHtml("Hello there.\nSecond line.\n\nNew paragraph.");
    assert.equal(html.match(/<p /g).length, 2);
    assert.match(html, /Hello there\.<br>Second line\./);
    assert.match(html, />New paragraph\.<\/p>/);
  });

  it("escapes everything typed", () => {
    const html = messageHtml(`<script>alert("x")</script> & <b>bold</b>`);
    assert.doesNotMatch(html, /<script|<b>/);
    assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; &lt;b&gt;/);
  });

  it("links web addresses, leaving the sentence's punctuation outside the link", () => {
    const html = messageHtml("See https://example.com/a?b=1&c=2. Or (https://example.org).");
    assert.match(html, /<a href="https:\/\/example\.com\/a\?b=1&amp;c=2" [^>]*>[^<]+<\/a>\. Or/);
    assert.match(html, /\(<a href="https:\/\/example\.org" [^>]*>https:\/\/example\.org<\/a>\)\./);
  });

  it("can't be talked into a link that runs script", () => {
    const html = messageHtml(`javascript:alert(1) https://x.com/"onmouseover="alert(1)`);
    assert.doesNotMatch(html, /href="javascript/);
    assert.doesNotMatch(html, /onmouseover="/); // the quote ends the address and is escaped
  });

  it("turns a block of dashed lines into a list", () => {
    const html = messageHtml("What's new:\n\n- Oldham County\n- A faster map\n* Search");
    assert.equal(html.match(/<li>/g).length, 3);
    assert.match(html, /<li>Oldham County<\/li>/);
    assert.doesNotMatch(html, /- Oldham/);
  });

  it("is empty for an empty message", () => {
    assert.equal(messageHtml(""), "");
    assert.equal(messageHtml(null), "");
    assert.equal(messageHtml(" \n\n \n"), "");
  });
});

describe("renderCustom", () => {
  const message = { subject: "  Oldham County is here ", body: "It's on the map now." };

  it("puts the subject in the headline and the message in the card", () => {
    const { subject, html, text } = renderCustom(message);
    assert.equal(subject, "Oldham County is here");
    assert.match(html, /LOUISVILLE<\/span>/); // the same brand line as the digest
    assert.match(html, />Oldham County is here<\/div>/);
    assert.match(html, /It&#39;s on the map now\./);
    assert.match(html, /Open the map/);
    assert.match(text, /^Oldham County is here\n\nIt's on the map now\./);
  });

  it("marks a test, and can leave the button out", () => {
    const { subject, html } = renderCustom(message, { test: true, button: false });
    assert.equal(subject, "[Test] Oldham County is here");
    assert.doesNotMatch(html, /Open the map/);
  });

  it("says why a subscriber got it and links their unsubscribe; nobody else sees either", () => {
    const url = "https://louisvillefoodsafe.netlify.app/?unsubscribe=tok";
    const mine = renderCustom(message, { unsubscribeUrl: url });
    assert.match(mine.html, /because you subscribed/);
    assert.match(mine.html, /href="https:\/\/louisvillefoodsafe\.netlify\.app\/\?unsubscribe=tok"/);
    assert.match(mine.text, /Unsubscribe: https:.*unsubscribe=tok$/);

    const theirs = renderCustom(message);
    assert.doesNotMatch(theirs.html, /because you subscribed|Unsubscribe/);
    assert.match(theirs.html, /About the data/);
    // Everyone gets the link to what the site stores about them.
    assert.match(theirs.html, /href="https:\/\/louisvillefoodsafe\.netlify\.app\/\?page=privacy"/);
  });

  it("escapes the subject", () => {
    const { html } = renderCustom({ subject: "<img src=x>", body: "x" });
    assert.doesNotMatch(html, /<img/);
  });
});
