// A signed-in person's own settings: the weekly digest (profiles.alert_frequency,
// lib/digest.js). Row-level security limits each call to their own row.
import { supabase } from "../lib/supabase.js";

/** The person's digest choice: { data: { alert_frequency } | null, error } */
export const fetchDigestChoice = (userId) =>
  supabase.from("profiles").select("alert_frequency").eq("id", userId).maybeSingle();

/** Sets it to "weekly" or "off". { error } */
export const saveDigestChoice = (userId, frequency) =>
  supabase.from("profiles").update({ alert_frequency: frequency }).eq("id", userId);

/**
 * The language of the person's weekly email ("en" or "es"): { data: { language } | null,
 * error }. A separate read, so a database without profiles.language (migration
 * 20261129000000, not run yet) only leaves the offer out.
 */
export const fetchDigestLanguage = (userId) =>
  supabase.from("profiles").select("language").eq("id", userId).maybeSingle();

/** Sets the language of the weekly email. { error } */
export const saveDigestLanguage = (userId, language) =>
  supabase.from("profiles").update({ language }).eq("id", userId);

/** The email footer's one-click unsubscribe. { data: true when it was a real link, error } */
export const unsubscribeByToken = (token) =>
  supabase.rpc("unsubscribe_by_token", { p_token: token });
