// submit-feedback: saves a message from the site's feedback form (FeedbackModal.jsx).
//
// Spam limit: at most 3 messages a minute and 20 a day from one scrambled IP address,
// counted in the feedback table itself (its ip_hash column). Until November 2026 this
// counted in Upstash Redis; the free database was deleted while unused, and every call
// failed. Counting here needs no other service.
//
// Secrets (Supabase dashboard, Edge Functions, Secrets): ALLOWED_ORIGIN (../_shared/cors.ts)
// and RATE_LIMIT_SALT (scrambles the IP). Deployed with "Verify JWT" off: the form sends
// no sign-in token.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const LIMITS = [
  { seconds: 60, max: 3 },
  { seconds: 24 * 60 * 60, max: 20 },
];

async function hashIP(ip: string): Promise<string> {
  const salt = Deno.env.get("RATE_LIMIT_SALT") ?? "lfs-feedback";
  const data = new TextEncoder().encode(ip + salt);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(""); // 64 hex chars — fits feedback.ip_hash CHECK (char_length <= 64)
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "anonymous";

  const ipHash = await hashIP(ip);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Spam limit (LIMITS): count this scrambled IP's recent messages. A count that fails
  // lets the message through rather than lose it.
  let retryAfter = 0;
  for (const { seconds, max } of LIMITS) {
    const since = new Date(Date.now() - seconds * 1000).toISOString();
    const { count, error } = await supabase
      .from("feedback")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", since);
    if (error) console.error("Feedback count failed:", error.message);
    else if ((count ?? 0) >= max) retryAfter = Math.max(retryAfter, seconds);
  }

  if (retryAfter) {
    return new Response(
      JSON.stringify({ error: "Too many feedback submissions. Please wait.", retryAfter }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Retry-After": String(retryAfter),
        },
      },
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const message = typeof payload.message === "string" ? payload.message.trim() : "";
  if (!payload.feedback_type || message.length < 10) {
    return new Response(JSON.stringify({ error: "Missing or invalid required fields" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { error } = await supabase.from("feedback").insert([
    {
      name: typeof payload.name === "string" ? payload.name.slice(0, 80) || null : null,
      email: typeof payload.email === "string" ? payload.email.slice(0, 120) || null : null,
      feedback_type: payload.feedback_type,
      message: message.slice(0, 1200),
      user_agent: typeof payload.user_agent === "string" ? payload.user_agent.slice(0, 300) : null,
      ip_hash: ipHash, // stored in feedback.ip_hash for duplicate/abuse tracking
    },
  ]);

  if (error) {
    console.error("Supabase insert error:", error);
    return new Response(JSON.stringify({ error: "Failed to save feedback" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
