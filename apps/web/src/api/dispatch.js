// Starting a GitHub workflow from an admin page, through one of the site's dispatch edge
// functions (supabase/functions/_shared/dispatch.ts): email-dispatch for the email
// outbox, pins-dispatch for the pin-fixes job. The function checks that the caller is
// an admin; this only reports what it said.
import { supabase } from "../lib/supabase.js";

/**
 * @param {string} name  the edge function
 * @param {object} [body]
 * @returns {Promise<{ started: boolean, reason?: string }>}  reason "unreachable" when
 *   the browser got no answer (usually CORS: ALLOWED_ORIGIN doesn't match the site)
 */
export async function startWorkflow(name, body = {}) {
  try {
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (error) {
      // The browser never got an answer: usually CORS (ALLOWED_ORIGIN doesn't match this
      // site exactly), sometimes no connection. lib/adminEmail.js says which to check.
      if (error.name === "FunctionsFetchError") return { started: false, reason: "unreachable" };
      // A non-2xx answer carries the function's own JSON in error.context (a Response).
      const answer = await error.context?.json?.().catch(() => null);
      return { started: false, reason: answer?.reason || error.message };
    }
    return { started: !!data?.started, reason: data?.reason };
  } catch (e) {
    return { started: false, reason: e.message };
  }
}
