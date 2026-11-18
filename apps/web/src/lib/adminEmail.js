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
  const why = {
    no_token: "the GitHub token isn't set up",
    not_admin: "this account isn't an admin",
    unreachable:
      "the browser couldn't reach it: check that the ALLOWED_ORIGIN secret is exactly this site's address, with no slash at the end",
  }[result.reason];
  return {
    ok: false,
    text: `Queued, but the sender didn't start (${why || result.reason || "no answer"}). Start it by hand:`,
  };
}
