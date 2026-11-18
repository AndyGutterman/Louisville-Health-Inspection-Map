/**
 * digest/store.js — every database read and write the email sender makes, behind plain
 * functions, so digest/run.js can be tested with stand-ins. `supa` is a service-role
 * client (lib/db.js).
 *
 * A recipient is { id, email, token, language }: language is "en" or "es" (profiles.language;
 * English for an address without an account); id is the account (null for an address without
 * one), token its unsubscribe token (null when it isn't subscribed).
 */
import {
  DIGEST_COLUMNS,
  groupSavedPlaces,
  groupWatchAreas,
  sinceFilter,
  windowStart,
} from "@lfs/core/email/digest.js";
import { emailLanguage } from "@lfs/core/email/words.js";
import { readAllPages } from "../lib/paging.js";

const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};
const addressOf = (p) => (p.alert_email || p.email || "").trim();

export function makeStore(supa, { warn = console.warn } = {}) {
  return {
    // The digest's window of get_whats_new: the filter runs in the database, so only the
    // window's rows are downloaded, not the function's 30 days.
    async weekRows(today, days) {
      return must(
        await supa
          .rpc("get_whats_new", { limit_n: 2000 })
          .or(sinceFilter(windowStart(today, days)))
          .select(DIGEST_COLUMNS),
        "read what's new",
      );
    },

    // Everyone on the weekly digest.
    async subscribers() {
      const rows = await readAllPages((from, to) =>
        supa
          .from("profiles")
          .select("id, email, alert_email, digest_token, language")
          .eq("alert_frequency", "weekly")
          .order("id")
          .range(from, to),
      );
      return rows
        .map((p) => ({
          id: p.id,
          email: addressOf(p),
          token: p.digest_token,
          language: emailLanguage(p.language),
        }))
        .filter((r) => r.email.includes("@"));
    },

    // One account's language ("en" or "es"), for a digest sent "as" them.
    async language(userId) {
      const row = must(
        await supa.from("profiles").select("language").eq("id", userId).maybeSingle(),
        "read the account's language",
      );
      return emailLanguage(row?.language);
    },

    // These addresses, each with its account when it has one (so the email shows that
    // person's watch areas) and its unsubscribe link only when it is subscribed.
    async accounts(emails) {
      const lower = emails.map((e) => e.toLowerCase());
      const found = new Map();
      for (const column of ["email", "alert_email"]) {
        const rows = must(
          await supa
            .from("profiles")
            .select("id, email, alert_email, digest_token, alert_frequency, language")
            .in(column, [...new Set([...emails, ...lower])]),
          "read the accounts of those addresses",
        );
        for (const p of rows) {
          for (const e of [p.alert_email, p.email]) {
            if (e && !found.has(e.trim().toLowerCase())) found.set(e.trim().toLowerCase(), p);
          }
        }
      }
      return emails.map((email) => {
        const p = found.get(email.toLowerCase());
        return {
          id: p?.id ?? null,
          email,
          token: p?.alert_frequency === "weekly" ? p.digest_token : null,
          language: emailLanguage(p?.language),
        };
      });
    },

    // Watch areas for the week: Map of user id -> areas. userIds null: every subscriber.
    // One small read (a few rows per area). The email still goes out without them if the
    // read fails, for example on a database that doesn't have digest_watch_areas yet.
    async watchAreas(days, userIds) {
      try {
        const rows = await readAllPages((from, to) =>
          supa
            .rpc("digest_watch_areas", { p_days: days, p_user_ids: userIds })
            .order("user_id")
            .order("area_id")
            .order("place_rank")
            .range(from, to),
        );
        return groupWatchAreas(rows);
      } catch (e) {
        warn(`Watch areas left out (${e.message}).`);
        return new Map();
      }
    },

    // Saved places inspected in the window: Map of user id -> [list] (groupSavedPlaces). userIds
    // null: every subscriber. Rows only for saved places that were inspected, so it's a
    // few per person at most. Like the watch areas, the email goes out without them if the
    // read fails (a database without digest_saved_places, migration 20261128000000).
    async savedPlaces(days, userIds) {
      try {
        const rows = await readAllPages((from, to) =>
          supa
            .rpc("digest_saved_places", { p_days: days, p_user_ids: userIds })
            .order("user_id")
            .range(from, to),
        );
        return groupSavedPlaces(rows);
      } catch (e) {
        warn(`Saved places left out (${e.message}).`);
        return new Map();
      }
    },

    // ── The outbox (email_jobs, email_deliveries; migration 20261125000000) ──────────

    // The addresses (lower case) a job has already been delivered to.
    async delivered(jobId) {
      const rows = await readAllPages((from, to) =>
        supa
          .from("email_deliveries")
          .select("email")
          .eq("job_id", jobId)
          .eq("status", "sent")
          .order("email")
          .range(from, to),
      );
      return new Set(rows.map((r) => r.email));
    },

    async recordDelivery(jobId, recipient, status, error = null) {
      must(
        await supa.from("email_deliveries").upsert(
          {
            job_id: jobId,
            email: recipient.email.toLowerCase(),
            user_id: recipient.id,
            status,
            error: error ? String(error).slice(0, 500) : null,
            at: new Date().toISOString(),
          },
          { onConflict: "job_id,email" },
        ),
        "record a delivery",
      );
    },

    async queuedJobs() {
      return must(
        await supa
          .from("email_jobs")
          .select("*")
          .eq("status", "queued")
          .order("queued_at")
          .limit(10),
        "read the outbox",
      );
    },

    // Takes a queued job for this run. Null when another run took it (or it was
    // cancelled) first: the update only matches a job that is still queued.
    async claim(jobId) {
      const rows = must(
        await supa
          .from("email_jobs")
          .update({ status: "sending", started_at: new Date().toISOString() })
          .eq("id", jobId)
          .eq("status", "queued")
          .select("*"),
        "claim a job",
      );
      return rows[0] ?? null;
    },

    async createJob(fields) {
      const rows = must(await supa.from("email_jobs").insert(fields).select("id"), "log the send");
      return rows[0].id;
    },

    async finish(jobId, fields) {
      must(
        await supa
          .from("email_jobs")
          .update({ finished_at: new Date().toISOString(), ...fields })
          .eq("id", jobId),
        "record the result",
      );
    },
  };
}
