// Is the signed-in person an admin (admin_users, migration 20261125000000)? Kept apart
// from api/admin.js so the Saved panel can ask without pulling the admin page's code
// into the main bundle. This only decides what the page shows: the database checks
// again on every admin call.
import { supabase } from "../lib/supabase.js";

const answers = new Map(); // user id -> Promise<boolean>: asked once per page load

/** @returns {Promise<boolean>} false for anyone signed out, and when it can't be checked */
export function fetchIsAdmin(userId) {
  if (!userId) return Promise.resolve(false);
  if (!answers.has(userId)) {
    answers.set(
      userId,
      supabase.rpc("is_admin").then(
        ({ data, error }) => !error && data === true,
        () => false,
      ),
    );
  }
  return answers.get(userId);
}
