import { createClient } from "@supabase/supabase-js";

// The one Supabase client for the whole app. Two clients sharing a session cause
// "Multiple GoTrueClient instances" warnings and token-refresh races.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);
