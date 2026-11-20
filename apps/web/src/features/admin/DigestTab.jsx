import { useEffect, useMemo, useRef, useState } from "react";
import { scrollBehavior } from "../../lib/motion.js";
import { SITE, renderDigest } from "@lfs/core/email/digest.js";
import { isEmail } from "@lfs/core/email/jobs.js";
import { setSubscription } from "../../api/admin.js";
import { confirmsCount, errorText, whenText } from "../../lib/adminEmail.js";
import EmailPreview from "./EmailPreview.jsx";
import { usePeople, usePersonalParts, useWeekSummary } from "./useDigestData.js";

const WINDOWS = [7, 14, 30];
const isOn = (person) => person?.alert_frequency === "weekly";
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function PersonRow({ person, picked, onPick }) {
  return (
    <button
      type="button"
      className={`adm-person${picked ? " on" : ""}`}
      aria-pressed={picked}
      data-testid="admin-person"
      onClick={onPick}
    >
      <span className="adm-person-email">{person.email || "(no email)"}</span>
      <span className="adm-chips">
        <span className={`adm-chip${isOn(person) ? " adm-chip--on" : ""}`}>
          {isOn(person) ? "Weekly" : "Off"}
        </span>
        {person.watch_areas > 0 && (
          <span className="adm-chip">{plural(person.watch_areas, "area")}</span>
        )}
        {person.saved_places > 0 && <span className="adm-chip">{person.saved_places} saved</span>}
        {person.last_sent_at && (
          <span className="adm-chip">sent {whenText(person.last_sent_at)}</span>
        )}
      </span>
    </button>
  );
}

/**
 * The weekly digest: pick anyone and see their email exactly as Tuesday's send would
 * write it, send it to yourself, to them, or as a test to any address (a spam checker's),
 * or send this week's to everyone now.
 * @param {{ me: object, send: (job, expectCount?) => Promise<void>,
 *   onSubscribers: (count: number|null) => void }} p  onSubscribers: the Write tab's
 *   "every subscriber" needs the same count
 */
export default function DigestTab({ me, send, onSubscribers }) {
  const [days, setDays] = useState(7);
  const week = useWeekSummary(days);
  const people = usePeople();
  useEffect(() => onSubscribers(people.subscribers), [people.subscribers, onSubscribers]);
  const [who, setWho] = useState(null); // an accounts row; null is the digest with no saved places or watch areas
  const person = who ? (people.rows.find((r) => r.user_id === who) ?? null) : null;
  const mine = usePersonalParts(person?.user_id ?? null, days);
  const previewRef = useRef(null);

  const [busy, setBusy] = useState(null); // which button is working
  const [error, setError] = useState(null);
  const [confirmThem, setConfirmThem] = useState(false);
  const [typed, setTyped] = useState("");
  const [testTo, setTestTo] = useState(""); // any address, e.g. a mail-tester.com one

  const email = useMemo(() => {
    if (!week.summary || mine.areas == null) return null;
    return renderDigest(week.summary, {
      areas: mine.areas,
      saved: mine.saved,
      // In the language they get it in (profiles.language; English before the migration).
      lang: person?.language,
      // The footer as they'd see it; the real link's token never leaves the database.
      unsubscribeUrl: isOn(person) ? `${SITE}/?unsubscribe=preview` : null,
    });
  }, [week.summary, mine.areas, mine.saved, person]);

  const pick = (userId) => {
    setWho(userId);
    setConfirmThem(false);
    setError(null);
    // On a phone the preview is below the list: bring it into view.
    requestAnimationFrame(() =>
      previewRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: "start" }),
    );
  };
  const act = async (name, work) => {
    setBusy(name);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const digest = (fields) => ({ kind: "digest", audience: "emails", days, ...fields });
  const toMe = () =>
    act("me", () =>
      send(digest({ to_emails: [me.email], as_user: person?.user_id ?? null, test: true })),
    );
  // The same test, to an address that needn't be an account: a spam checker's, a colleague's.
  const toAddress = () =>
    act("address", () =>
      send(digest({ to_emails: [testTo.trim()], as_user: person?.user_id ?? null, test: true })),
    );
  const toThem = () =>
    act("them", () => send(digest({ to_emails: [person.email], test: false }))).then(() =>
      setConfirmThem(false),
    );
  const toggle = () =>
    act("toggle", async () => {
      const on = !isOn(person);
      await setSubscription(person.user_id, on);
      people.setWeekly(person.user_id, on);
    });
  const toEveryone = () =>
    act("everyone", async () => {
      await send({ kind: "digest", audience: "subscribers", days }, people.subscribers);
      setTyped("");
    });

  const s = week.summary;
  return (
    <div className="adm-digest">
      <section className="adm-card adm-week" data-testid="admin-week">
        <div>
          <div className="adm-card-title">This week&apos;s digest</div>
          <div className="adm-dim">
            {s
              ? `${plural(s.total, "inspection")} · ${s.failing.length} failing · ${s.perfect.length} perfect`
              : week.error || "Reading the week's inspections…"}
          </div>
        </div>
        <label className="adm-field adm-field--inline">
          <span className="adm-dim">Covers the last</span>
          <select
            className="adm-select"
            aria-label="Days the digest covers"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {WINDOWS.map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </select>
        </label>
      </section>

      <div className="adm-split">
        <section className="adm-card adm-people">
          <div className="adm-card-title">Preview as</div>
          <div className="adm-dim" data-testid="admin-people-count">
            {people.subscribers == null
              ? people.error || "Reading accounts…"
              : `${plural(people.subscribers, "subscriber")} · ${plural(people.total, "account")}${people.search.trim() ? " found" : ""}`}
          </div>
          <input
            className="adm-input"
            type="search"
            placeholder="Find an email"
            aria-label="Find an account by email"
            value={people.search}
            onChange={(e) => people.setSearch(e.target.value)}
          />
          <div className="adm-people-list">
            <button
              type="button"
              className={`adm-person${who == null ? " on" : ""}`}
              aria-pressed={who == null}
              onClick={() => pick(null)}
            >
              <span className="adm-person-email">Someone with nothing saved</span>
              <span className="adm-chips">
                <span className="adm-chip">the part everyone gets</span>
              </span>
            </button>
            {people.rows.map((p) => (
              <PersonRow
                key={p.user_id}
                person={p}
                picked={p.user_id === who}
                onPick={() => pick(p.user_id)}
              />
            ))}
            {people.hasMore && (
              <button
                type="button"
                className="adm-btn adm-btn--quiet"
                disabled={people.loading}
                onClick={people.more}
              >
                {people.loading ? "Loading…" : "Show more"}
              </button>
            )}
          </div>
        </section>

        <section className="adm-card adm-previewing" ref={previewRef}>
          <div className="adm-card-title" data-testid="admin-preview-who">
            {person ? person.email : "Someone with nothing saved"}
          </div>
          {person && (
            <div className="adm-dim" data-testid="admin-preview-language">
              Email language: {person.language === "es" ? "Spanish" : "English"}
            </div>
          )}
          {person && !isOn(person) && (
            <div className="adm-dim">
              Not subscribed: Tuesday&apos;s send skips them. This is what they&apos;d get.
            </div>
          )}
          <EmailPreview
            email={email}
            loading={week.loading || mine.loading}
            note={week.error || mine.error}
          />
          <div className="adm-actions">
            <button
              type="button"
              className="adm-btn adm-btn--go"
              disabled={!email || busy != null}
              onClick={toMe}
            >
              {busy === "me" ? "Queueing…" : "Send me this as a test"}
            </button>
            {person?.email &&
              (confirmThem ? (
                <>
                  <button
                    type="button"
                    className="adm-btn adm-btn--warn"
                    disabled={busy != null}
                    onClick={toThem}
                  >
                    {busy === "them" ? "Queueing…" : `Yes, email ${person.email}`}
                  </button>
                  <button
                    type="button"
                    className="adm-btn adm-btn--quiet"
                    onClick={() => setConfirmThem(false)}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="adm-btn"
                  disabled={!email || busy != null}
                  onClick={() => setConfirmThem(true)}
                >
                  Send it to them
                </button>
              ))}
            {person && (
              <button
                type="button"
                className="adm-btn adm-btn--quiet"
                disabled={busy != null}
                onClick={toggle}
              >
                {isOn(person) ? "Take off the weekly digest" : "Put on the weekly digest"}
              </button>
            )}
          </div>
          <form
            className="adm-actions"
            data-testid="admin-test-address"
            onSubmit={(e) => {
              e.preventDefault();
              toAddress();
            }}
          >
            <input
              className="adm-input"
              type="email"
              autoComplete="off"
              aria-label="Send this as a test to another address"
              placeholder="Test to another address (mail-tester.com…)"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
            />
            <button
              type="submit"
              className="adm-btn"
              disabled={!email || busy != null || !isEmail(testTo)}
            >
              {busy === "address" ? "Queueing…" : "Send test"}
            </button>
          </form>
          <div className="adm-dim">
            Marked [Test], with a placeholder unsubscribe link that works for nobody.
          </div>
          {error && (
            <div className="adm-error" role="alert">
              {error}
            </div>
          )}
        </section>
      </div>

      <section className="adm-card adm-everyone" data-testid="admin-everyone">
        <div className="adm-card-title">Send to every subscriber now</div>
        <div className="adm-dim">
          Each of the {people.subscribers ?? "…"} subscribers gets their own digest for the last{" "}
          {days} days, straight away. Tuesday&apos;s send still goes out as usual.
        </div>
        <div className="adm-actions">
          <input
            className="adm-input adm-input--short"
            inputMode="numeric"
            aria-label="Type the number of subscribers to confirm"
            placeholder={`Type ${people.subscribers ?? "the number"} to confirm`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
          <button
            type="button"
            className="adm-btn adm-btn--warn"
            disabled={!s || busy != null || !confirmsCount(typed, people.subscribers ?? 0)}
            onClick={toEveryone}
          >
            {busy === "everyone"
              ? "Queueing…"
              : `Send to ${plural(people.subscribers ?? 0, "subscriber")}`}
          </button>
        </div>
      </section>
    </div>
  );
}
