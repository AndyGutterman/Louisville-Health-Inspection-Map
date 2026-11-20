// Small rules for the email admin page (features/admin). Pure. The emails themselves and
// the rules for a job are shared with the pipeline: @lfs/core/email.

export const OUTBOX_WORKFLOW_URL =
  "https://github.com/AndyGutterman/Louisville-Health-Inspection-Map/actions/workflows/email-outbox.yml";
export const MIGRATION = "20261125000000_email_admin.sql";

// The Write tab's form before anything is typed.
export const EMPTY_MESSAGE = {
  subject: "",
  body: "",
  button: true,
  audience: "me", // "me" | "list" | "subscribers"
  addresses: "",
};

/** Today in Louisville (YYYY-MM-DD): the day the sender would stamp on a digest. */
export const louisvilleToday = (now = new Date()) =>
  now.toLocaleDateString("en-CA", { timeZone: "America/Kentucky/Louisville" });

/**
 * The email's HTML, made safe to browse in the preview frame: links open in a new tab
 * (the frame is sandboxed and must never navigate itself).
 */
export const previewDoc = (html) =>
  String(html ?? "").replace(/<head>/i, '<head><base target="_blank">');

/** An email to every subscriber is confirmed by typing how many people that is. */
export const confirmsCount = (typed, count) =>
  count > 0 && String(typed ?? "").trim() === String(count);

/**
 * Where the arrow keys, Home and End take the tab list (the ARIA tabs pattern). Returns
 * the tab to move to, or null for any other key. Wraps at both ends.
 * @param {string[]} names  the tabs in order
 * @param {string} current  the focused tab
 * @param {string} key      the KeyboardEvent.key
 */
export function nextTab(names, current, key) {
  if (!names.length) return null;
  const i = names.indexOf(current);
  if (key === "ArrowRight") return names[(i + 1) % names.length];
  if (key === "ArrowLeft") return names[(i - 1 + names.length) % names.length];
  if (key === "Home") return names[0];
  if (key === "End") return names[names.length - 1];
  return null;
}

const LOUISVILLE = "America/Kentucky/Louisville";

/**
 * A Louisville wall-clock time ("2026-11-20T14:30", from a datetime-local input) as the
 * ISO instant it is. Null when it isn't a time.
 */
export function louisvilleToIso(local) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(local ?? ""));
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  // What Louisville's clock reads at that instant, as if it were UTC: the difference is
  // Louisville's offset, which the instant is the wall time less.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: LOUISVILLE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(wall));
  const at = (type) => Number(parts.find((p) => p.type === type).value);
  const shown = Date.UTC(at("year"), at("month") - 1, at("day"), at("hour"), at("minute"));
  return new Date(wall - (shown - wall)).toISOString();
}

/** Why a scheduled time can't be used, in words; null when it can. */
export function scheduleProblem(iso, now = Date.now()) {
  if (!iso) return "Pick a date and time.";
  const t = new Date(iso).getTime();
  if (!(t > now)) return "Pick a time in the future.";
  if (t > now + 30 * 24 * 60 * 60 * 1000) return "Schedule up to 30 days ahead.";
  return null;
}

/** "Thu, Nov 20, 2:30 PM" in Louisville, for a scheduled send. */
export const scheduledText = (iso) =>
  new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: LOUISVILLE,
  });

/** A database error in words the page can show. */
export function errorText(error) {
  const code = error?.code;
  const message = error?.message || String(error ?? "Something went wrong.");
  // PGRST202: PostgREST has no such function; 42883: Postgres hasn't.
  if (code === "PGRST202" || code === "42883") {
    return `The database doesn't have the email admin yet. Run supabase/migrations/${MIGRATION}.`;
  }
  if (code === "42501") return "This account isn't an admin.";
  return message;
}

/** "just now", "5 min ago", "3 hr ago", then the date ("Nov 10, 6:02 AM"). */
export function whenText(iso, now = Date.now()) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const minutes = Math.round((now - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} hr ago`;
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Kentucky/Louisville",
  });
}

/** "Sent 12", "Sent 11 of 12 · 1 failed", or "" before anything has gone. */
export function countsText(job) {
  const sent = job.sent_count ?? 0;
  const failed = job.failed_count ?? 0;
  if (!sent && !failed) return "";
  const of =
    job.recipient_count && job.recipient_count !== sent ? ` of ${job.recipient_count}` : "";
  return `Sent ${sent}${of}${failed ? ` · ${failed} failed` : ""}`;
}

/** What the page says after queueing, from startSender's answer. */
export function queuedNotice(result) {
  if (result.started) {
    return {
      ok: true,
      text: "Queued, and the sender is starting. It usually lands in a minute or two.",
    };
  }
  return {
    ok: false,
    text: `Queued, but the sender didn't start (${whyNotStarted(result.reason)}). Start it by hand:`,
  };
}

/** Why a dispatch function (api/dispatch.js) didn't start its workflow, in words. */
export function whyNotStarted(reason) {
  const why = {
    no_token: "the GitHub token isn't set up",
    not_admin: "this account isn't an admin",
    unreachable:
      "the browser couldn't reach it: check that the ALLOWED_ORIGIN secret is exactly this site's address, with no slash at the end",
  }[reason];
  return why || reason || "no answer";
}
