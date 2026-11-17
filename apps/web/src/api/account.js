// A signed-in person's own settings: the weekly digest (profiles.alert_frequency,
// lib/digest.js). Row-level security limits each call to their own row.
import { supabase } from "../lib/supabase.js";

/** The person's digest choice: { data: { alert_frequency } | null, error } */
export const fetchDigestChoice = (userId) =>
  supabase.from("profiles").select("alert_frequency").eq("id", userId).maybeSingle();

/** Sets it to "weekly" or "off". { error } */
export const saveDigestChoice = (userId, frequency) =>
  supabase.from("profiles").update({ alert_frequency: frequency }).eq("id", userId);

/** The email footer's one-click unsubscribe. { data: true when it was a real link, error } */
export const unsubscribeByToken = (token) =>
  supabase.rpc("unsubscribe_by_token", { p_token: token });
