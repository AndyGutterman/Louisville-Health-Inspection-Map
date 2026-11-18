/**
 * email/custom.js — a one-off message written on the site's email admin page, in the same
 * card as the weekly digest. Pure, so the admin page previews exactly what is sent.
 *
 * The message is plain text: a blank line starts a paragraph, a line starting "- " is a
 * list item, and web addresses become links. Nothing typed is treated as HTML.
 */
import { wordsFor } from "./words.js";
import { SITE, TEXT, DIM, GREEN, esc, mapButton, footerLinks, page } from "./theme.js";

const URL_RE = /https?:\/\/[^\s<>"]+/g;
// A full stop or bracket right after an address belongs to the sentence, not the link.
const TRAILING = /[.,;:!?)\]]+$/;

// One line of the message as HTML: everything escaped, web addresses linked.
function inline(line) {
  let out = "";
  let last = 0;
  for (const m of line.matchAll(URL_RE)) {
    const url = m[0].replace(TRAILING, "");
    out += esc(line.slice(last, m.index));
    out += `<a href="${esc(url)}" style="color:${GREEN};">${esc(url)}</a>`;
    last = m.index + url.length;
  }
  return out + esc(line.slice(last));
}

const isItem = (line) => /^\s*[-*•]\s+/.test(line);
const P = `margin:0 0 14px;font-size:15px;line-height:1.6;color:${TEXT};`;

/** The message's paragraphs and lists as HTML. Empty for an empty message. */
export function messageHtml(body) {
  return String(body ?? "")
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((block) => block.split("\n").filter((l) => l.trim()))
    .filter((lines) => lines.length)
    .map((lines) =>
      lines.every(isItem)
        ? `<ul style="${P}padding-left:20px;">${lines
            .map((l) => `<li>${inline(l.replace(/^\s*[-*•]\s+/, ""))}</li>`)
            .join("")}</ul>`
        : `<p style="${P}">${lines.map((l) => inline(l.trim())).join("<br>")}</p>`,
    )
    .join("\n");
}

/**
 * The email: { subject, html, text }.
 * @param {{subject: string, body: string}} message
 * @param {object} [o]
 * @param {string|null} [o.unsubscribeUrl]  per recipient; null for someone not subscribed
 * @param {boolean} [o.test]    marks the subject, for a test send
 * @param {boolean} [o.button]  the "Open the map" button under the message
 * @param {string} [o.lang]     the recipient's language (en or es): the footer, the button
 *   and the test mark; the message itself is as written
 */
export function renderCustom(
  { subject, body },
  { unsubscribeUrl = null, test = false, button = true, lang = "en" } = {},
) {
  const w = wordsFor(lang);
  const title = String(subject ?? "").trim();
  const fullSubject = `${test ? w.test : ""}${title}`;
  const why = unsubscribeUrl ? `${esc(w.why)}<br>` : "";
  const html = page({
    title: fullSubject,
    header: `<div style="font-size:22px;font-weight:800;margin-top:10px;line-height:1.25;">${esc(title)}</div>`,
    rows: `<tr><td style="padding:18px 0 0;">${messageHtml(body)}</td></tr>
  ${button ? mapButton(w.openMap) : ""}
  <tr><td style="padding:22px 0 0;color:${DIM};font-size:11px;line-height:1.6;text-align:center;">
    ${why}${footerLinks(unsubscribeUrl, lang)}<br>Louisville Food Safe · Louisville, KY
  </td></tr>`,
    lang,
  });
  const text = [
    title,
    "",
    String(body ?? "")
      .replace(/\r\n?/g, "\n")
      .trim(),
    "",
    SITE,
    ...(unsubscribeUrl ? [w.unsubscribeText(unsubscribeUrl)] : []),
  ].join("\n");
  return { subject: fullSubject, html, text };
}
