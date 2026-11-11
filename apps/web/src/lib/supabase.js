import { createClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// The one Supabase client with sign-in, for the whole app. Two auth clients sharing a
// session cause "Multiple GoTrueClient instances" warnings and token-refresh races.
export const supabase = createClient(URL, KEY);

// Read-only client for public data (the map pins). It has no auth client at all
// (`accessToken` turns it off and requests go out with the anon key), so a request never
// waits on the signed-in session: on phones, restoring or refreshing a session can hold
// the auth lock and stall every request queued behind it.
export const publicDb = createClient(URL, KEY, { accessToken: async () => null });
