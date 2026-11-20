import { useMemo, useState } from "react";
import { SITE } from "@lfs/core/email/digest.js";
import { renderCustom } from "@lfs/core/email/custom.js";
import { LIMITS, checkJob, parseEmails } from "@lfs/core/email/jobs.js";
import {
  confirmsCount,
  errorText,
  louisvilleToIso,
  scheduleProblem,
} from "../../lib/adminEmail.js";
import EmailPreview from "./EmailPreview.jsx";

const AUDIENCES = [
  ["me", "Just me", "A test, marked [Test] in the subject."],
  ["list", "These addresses", `Up to ${LIMITS.emails}, separated by commas or new lines.`],
  [
    "subscribers",
    "Every subscriber",
    "Everyone on the weekly digest, with their unsubscribe link.",
  ],
];

/**
 * A one-off email in the site's card: write it, see it as it will arrive, send it to
 * yourself first. `message` lives in AdminPage, so a half-written email survives a look
 * at another tab.
 * @param {{ me: object, message: object, onChange: Function, subscribers: number|null,
 *   send: (job, expectCount?) => Promise<void> }} p
 */
export default function WriteTab({ me, message, onChange, subscribers, send }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [typed, setTyped] = useState("");
  const [when, setWhen] = useState("now"); // "now" | "later"
  const [at, setAt] = useState(""); // the Louisville date and time, for "later"
  const set = (fields) => {
    setError(null);
    onChange({ ...message, ...fields });
  };

  const { audience } = message;
  const everyone = audience === "subscribers";
  const list = useMemo(() => parseEmails(message.addresses), [message.addresses]);
  // Only a one-off email to yourself or a list can wait: an email to every subscriber goes
  // out now, since its count is checked when it is queued.
  const scheduling = !everyone && when === "later";
  const sendAt = scheduling ? louisvilleToIso(at) : null;
  const job = {
    kind: "custom",
    audience: everyone ? "subscribers" : "emails",
    to_emails: everyone ? null : audience === "me" ? [me.email] : list.emails,
    subject: message.subject,
    body: message.body,
    with_button: message.button,
    test: audience === "me",
    send_at: sendAt,
  };
  const problem =
    audience === "list" && list.invalid.length
      ? `"${list.invalid[0]}" isn't an email address.`
      : (checkJob(job) ?? (scheduling ? scheduleProblem(sendAt) : null));
  const confirmed = !everyone || confirmsCount(typed, subscribers ?? 0);

  const email = useMemo(
    () =>
      message.subject.trim() || message.body.trim()
        ? renderCustom(message, {
            test: audience === "me",
            button: message.button,
            unsubscribeUrl: everyone ? `${SITE}/?unsubscribe=preview` : null,
          })
        : null,
    [message, audience, everyone],
  );

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await send(job, everyone ? subscribers : null);
      setTyped("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const label =
    audience === "me"
      ? "Send me a test"
      : everyone
        ? `Send to ${subscribers ?? 0} subscriber${subscribers === 1 ? "" : "s"}`
        : `Send to ${list.emails.length} address${list.emails.length === 1 ? "" : "es"}`;

  return (
    <div className="adm-split adm-split--write">
      <section className="adm-card adm-form">
        <label className="adm-field">
          <span className="adm-label">Subject</span>
          <input
            className="adm-input"
            type="text"
            maxLength={LIMITS.subject}
            value={message.subject}
            onChange={(e) => set({ subject: e.target.value })}
          />
        </label>
        <div className="adm-field">
          <label className="adm-label" htmlFor="adm-message">
            Message
          </label>
          <textarea
            id="adm-message"
            className="adm-input adm-textarea"
            rows={9}
            maxLength={LIMITS.body}
            aria-describedby="adm-message-hint"
            value={message.body}
            onChange={(e) => set({ body: e.target.value })}
          />
          <span className="adm-dim adm-hint" id="adm-message-hint">
            Plain text. A blank line starts a paragraph, lines starting with “- ” make a list, and
            web addresses become links.
          </span>
        </div>
        <label className="adm-check">
          <input
            type="checkbox"
            checked={message.button}
            onChange={(e) => set({ button: e.target.checked })}
          />
          <span>An “Open the map” button under the message</span>
        </label>

        <fieldset className="adm-audience">
          <legend className="adm-label">Send to</legend>
          {AUDIENCES.map(([value, name, hint]) => (
            <label key={value} className={`adm-radio${audience === value ? " on" : ""}`}>
              <input
                type="radio"
                name="adm-audience"
                value={value}
                checked={audience === value}
                onChange={() => set({ audience: value })}
              />
              <span>
                <span className="adm-radio-name">
                  {name}
                  {value === "subscribers" && subscribers != null ? ` (${subscribers})` : ""}
                </span>
                <span className="adm-dim adm-hint">
                  {value === "me" ? `${me.email}. ${hint}` : hint}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        {!everyone && (
          <fieldset className="adm-audience">
            <legend className="adm-label">When</legend>
            <label className={`adm-radio${when === "now" ? " on" : ""}`}>
              <input
                type="radio"
                name="adm-when"
                value="now"
                checked={when === "now"}
                onChange={() => setWhen("now")}
              />
              <span className="adm-radio-name">Now</span>
            </label>
            <label className={`adm-radio${when === "later" ? " on" : ""}`}>
              <input
                type="radio"
                name="adm-when"
                value="later"
                checked={when === "later"}
                onChange={() => setWhen("later")}
              />
              <span className="adm-radio-name">Later</span>
            </label>
            {when === "later" && (
              <input
                className="adm-input adm-input--short"
                type="datetime-local"
                aria-label="When to send, Louisville time"
                value={at}
                onChange={(e) => setAt(e.target.value)}
              />
            )}
            {when === "later" && (
              <span className="adm-dim adm-hint">Louisville time, up to 30 days ahead.</span>
            )}
          </fieldset>
        )}
        {audience === "list" && (
          <textarea
            className="adm-input adm-textarea"
            rows={3}
            aria-label="Addresses to send to"
            placeholder="a@example.com, b@example.com"
            value={message.addresses}
            onChange={(e) => set({ addresses: e.target.value })}
          />
        )}
        {everyone && (
          <input
            className="adm-input adm-input--short"
            inputMode="numeric"
            aria-label="Type the number of subscribers to confirm"
            placeholder={`Type ${subscribers ?? "the number"} to confirm`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
        )}

        <div className="adm-actions">
          <button
            type="button"
            className={`adm-btn ${everyone ? "adm-btn--warn" : "adm-btn--go"}`}
            disabled={busy || !!problem || !confirmed}
            onClick={submit}
          >
            {busy ? "Queueing…" : scheduling ? "Schedule email" : label}
          </button>
          {problem && (message.subject || message.body) && (
            <span className="adm-dim" data-testid="write-problem">
              {problem}
            </span>
          )}
        </div>
        {error && (
          <div className="adm-error" role="alert">
            {error}
          </div>
        )}
      </section>

      <section className="adm-card adm-previewing">
        <div className="adm-card-title">Preview</div>
        <EmailPreview email={email} note="Start writing and the email shows here." />
      </section>
    </div>
  );
}
