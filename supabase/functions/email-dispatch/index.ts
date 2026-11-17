// email-dispatch: starts the "Email outbox" GitHub workflow the moment the email admin
// page queues an email (docs/EMAIL_ADMIN.md), so a test lands in a minute or two instead
// of waiting for someone to start the workflow by hand.
//
// It sends nothing itself and never sees an email's content: the job is already in
// email_jobs, and the workflow reads it from there with the service-role key.
//
// Who may call it: an admin, and nobody else. The caller's own session is passed to the
// database's is_admin() (migration 20261125000000), so the check is the same one every
// admin_* function makes. No service-role key is used here.
//
// Secrets (Supabase dashboard, Edge Functions, Secrets):
//   GITHUB_DISPATCH_TOKEN  a fine-grained GitHub token for this one repository with
//                          "Actions: Read and write". Without it the function answers
//                          { started: false, reason: "no_token" } and the page says so.
//   GITHUB_REPO            optional, "owner/name"; defaults to this project's repository
//   ALLOWED_ORIGIN         optional, the site's address; the same secret submit-feedback uses
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const REPO = Deno.env.get("GITHUB_REPO") ?? "AndyGutterman/Louisville-Health-Inspection-Map";
const WORKFLOW = "email-outbox.yml";
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ started: false, reason: "POST only" }, 405);

  // The caller's session decides: is_admin() reads auth.uid() from this token.
  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer "))
    return json({ started: false, reason: "not_admin" }, 401);
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: isAdmin, error } = await supabase.rpc("is_admin");
  if (error || isAdmin !== true) return json({ started: false, reason: "not_admin" }, 403);

  // The job's id only labels the run; the workflow sends everything that is queued.
  const body = await req.json().catch(() => ({}));
  const job = typeof body?.job === "string" && UUID.test(body.job) ? body.job : "";

  const token = Deno.env.get("GITHUB_DISPATCH_TOKEN");
  if (!token) return json({ started: false, reason: "no_token" });

  const res = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "lfs-email-dispatch",
      },
      body: JSON.stringify({ ref: "main", inputs: { job } }),
    },
  );
  if (res.status === 204) return json({ started: true });

  // GitHub's reason, without anything of ours in it (the token is never echoed).
  const detail = await res.json().catch(() => null);
  console.error("GitHub dispatch failed:", res.status, detail?.message);
  return json({
    started: false,
    reason: `GitHub answered ${res.status}${detail?.message ? `: ${detail.message}` : ""}`,
  });
});
