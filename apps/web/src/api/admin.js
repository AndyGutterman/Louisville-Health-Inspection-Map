// Every database call behind the email admin page (features/admin, docs/EMAIL_ADMIN.md).
// All of them run as the signed-in person: the admin_* functions check for an admin
// themselves (migration 20261125000000), so nothing here is a secret.
//
// Egress: the week's inspections are the only read of any size (the digest's window of
// get_whats_new, filtered in the database). The page asks for them once per window and
// keeps them (features/admin/useDigestData.js); everything else is a few rows.
import { supabase } from "../lib/supabase.js";
import {
  DIGEST_COLUMNS,
  groupSavedPlaces,
  groupWatchAreas,
  sinceFilter,
  windowStart,
} from "@lfs/core/email/digest.js";

const must = ({ data, error }) => {
  if (error) throw error;
  return data;
};

export const SUBSCRIBERS_PAGE = 50;

/** Accounts, subscribers first: admin_subscribers rows (each carries `total`, `subscribers`). */
export async function fetchSubscribers({ search = "", offset = 0 } = {}) {
  return must(
    await supabase.rpc("admin_subscribers", {
      p_search: search.trim() || null,
      p_limit: SUBSCRIBERS_PAGE,
      p_offset: offset,
    }),
  );
}

/** The digest's window of What's New rows, exactly what the sender reads. */
export async function fetchWeekRows(today, days) {
  return must(
    await supabase
      .rpc("get_whats_new", { limit_n: 2000 })
      .or(sinceFilter(windowStart(today, days)))
      .select(DIGEST_COLUMNS),
  );
}

/** One person's watch areas for the window, as the email shows them. */
export async function fetchWatchAreas(userId, days) {
  const rows = must(
    await supabase.rpc("admin_digest_watch_areas", { p_user_id: userId, p_days: days }),
  );
  return groupWatchAreas(rows).get(userId) ?? [];
}

/** One person's saved lists with their places inspected in the window ([{ id, name, total, places }]). */
export async function fetchDigestSaved(userId, days) {
  const rows = must(
    await supabase.rpc("admin_digest_saved_places", { p_user_id: userId, p_days: days }),
  );
  return groupSavedPlaces(rows).get(userId) ?? [];
}

/**
 * Queues an email (a job as in @lfs/core/email/jobs.js). expectCount: for an email to
 * every subscriber, the number the page showed; the database refuses if it has changed.
 * @returns {Promise<string>} the job's id
 */
export async function queueEmail(job, expectCount = null) {
  return must(
    await supabase.rpc("admin_queue_email", {
      p_kind: job.kind,
      p_audience: job.audience,
      p_to_emails: job.to_emails ?? null,
      p_as_user: job.as_user ?? null,
      p_days: job.days ?? 7,
      p_test: !!job.test,
      p_subject: job.subject ?? null,
      p_body: job.body ?? null,
      p_with_button: job.with_button ?? true,
      p_expect_count: expectCount,
    }),
  );
}

/**
 * Asks the email-dispatch function to start the sender now (the "Email outbox"
 * workflow). The job is already queued, so this never throws: when it can't start the
 * sender it says why, and the workflow can be started by hand.
 * @returns {Promise<{ started: boolean, reason?: string }>}
 */
export async function startSender(jobId) {
  try {
    const { data, error } = await supabase.functions.invoke("email-dispatch", {
      body: { job: jobId },
    });
    if (error) {
      // A non-2xx answer carries the function's own JSON in error.context (a Response).
      const body = await error.context?.json?.().catch(() => null);
      return { started: false, reason: body?.reason || error.message };
    }
    return { started: !!data?.started, reason: data?.reason };
  } catch (e) {
    return { started: false, reason: e.message };
  }
}

export async function fetchJobs(limit = 10) {
  return must(await supabase.rpc("admin_email_jobs", { p_limit: limit }));
}

/** One job in full (its message), or null. */
export async function fetchJob(id) {
  return must(await supabase.rpc("admin_email_job", { p_id: id }))?.[0] ?? null;
}

export async function fetchDeliveries(jobId) {
  return must(await supabase.rpc("admin_email_deliveries", { p_job_id: jobId }));
}

export const cancelJob = async (id) => must(await supabase.rpc("admin_cancel_email", { p_id: id }));
export const retryJob = async (id) => must(await supabase.rpc("admin_retry_email", { p_id: id }));
export const setSubscription = async (userId, on) =>
  must(await supabase.rpc("admin_set_subscription", { p_user_id: userId, p_on: on }));
