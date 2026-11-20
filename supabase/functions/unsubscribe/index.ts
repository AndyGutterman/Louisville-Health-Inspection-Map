// unsubscribe: the one-click unsubscribe behind Gmail's and Outlook's "Unsubscribe" button
// (RFC 8058, docs/DIGEST.md, "Landing in spam"). The email's List-Unsubscribe header points
// here with the subscriber's token, and the mail provider's server POSTs to it.
//
// POST only. A GET gets 405, so a link scanner that opens every URL in an email can't
// unsubscribe anyone; the footer's link still goes to the site's own page.
//
// It calls the same unsubscribe_by_token function as that page, with the anon key (migration
// 20261116000000), so it can do nothing the page can't. It always answers 200 for a
// well-formed token, so it doesn't say whether a token exists. No CORS: no browser calls it.
//
// Uses SUPABASE_URL and SUPABASE_ANON_KEY, which every edge function has. Deployed with
// "Verify JWT" off: the mail provider sends no sign-in token.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const reply = (status: number, text: string) =>
  new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, "Method not allowed");

  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!UUID.test(token)) return reply(400, "Bad token");

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { error } = await supabase.rpc("unsubscribe_by_token", { p_token: token });
  // The token is a secret: never log it.
  if (error) {
    console.error("unsubscribe failed:", error.message);
    return reply(500, "Try again later");
  }
  return reply(200, "Unsubscribed");
});
