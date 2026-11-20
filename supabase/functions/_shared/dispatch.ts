// Starts one of this repository's GitHub workflows for an admin of the site: shared by
// email-dispatch (the email outbox) and pins-dispatch (the pin-fixes job).
//
// The function sends nothing and changes nothing itself: the work is already queued in
// the database, and the workflow reads it from there with the service-role key.
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
//                          (./cors.ts)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";

const REPO = Deno.env.get("GITHUB_REPO") ?? "AndyGutterman/Louisville-Health-Inspection-Map";

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/**
 * @param workflow   the workflow file, e.g. "email-outbox.yml"
 * @param userAgent  for GitHub's API
 * @param inputs     the workflow's inputs, from the request's JSON body (checked here)
 */
export function dispatchHandler({
  workflow,
  userAgent,
  inputs = () => ({}),
}: {
  workflow: string;
  userAgent: string;
  inputs?: (body: Record<string, unknown> | null) => Record<string, string>;
}) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (req.method !== "POST") return json({ started: false, reason: "POST only" }, 405);

    // The caller's session decides: is_admin() reads auth.uid() from this token.
    const authorization = req.headers.get("Authorization") ?? "";
    if (!authorization.startsWith("Bearer "))
      return json({ started: false, reason: "not_admin" }, 401);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const { data: isAdmin, error } = await supabase.rpc("is_admin");
    if (error || isAdmin !== true) return json({ started: false, reason: "not_admin" }, 403);

    const body = await req.json().catch(() => null);

    const token = Deno.env.get("GITHUB_DISPATCH_TOKEN");
    if (!token) return json({ started: false, reason: "no_token" });

    const res = await fetch(
      `https://api.github.com/repos/${REPO}/actions/workflows/${workflow}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": userAgent,
        },
        body: JSON.stringify({ ref: "main", inputs: inputs(body) }),
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
  };
}
