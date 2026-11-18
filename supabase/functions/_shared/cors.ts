// CORS headers for the site's edge functions (submit-feedback, email-dispatch).
//
// ALLOWED_ORIGIN (Supabase dashboard, Edge Functions, Secrets) is the site's address. A
// browser sends its origin with no trailing slash and needs an exact match, so a slash is
// dropped here: the secret was once saved as "https://louisvillefoodsafe.netlify.app/",
// and every call from the site was blocked after the preflight, feedback included, for
// five months (fixed 2026-11-18). Without the secret, any origin is allowed.
const origin = (Deno.env.get("ALLOWED_ORIGIN") ?? "").trim().replace(/\/+$/, "") || "*";

export const corsHeaders = {
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
