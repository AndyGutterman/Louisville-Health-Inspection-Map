// unsubscribe: the one-click unsubscribe behind Gmail's and Outlook's "Unsubscribe" button
// (RFC 8058, docs/DIGEST.md, "Landing in spam"). The email's List-Unsubscribe header points
// here with the subscriber's token, and the mail provider's server POSTs to it.
//
// Only a POST unsubscribes. A GET (a link scanner, or a mail app without one-click, such as
// Apple Mail or Thunderbird, opening the header's link in a browser) is sent on to the
// site's own unsubscribe page, the same page as the footer's link.
//
// It calls the same unsubscribe_by_token function as that page, with the anon key (migration
// 20261116000000), so it can do nothing the page can't. It always answers 200 for a
// well-formed token, so it doesn't say whether a token exists. No CORS: no browser calls it.
//
// Uses SUPABASE_URL and SUPABASE_ANON_KEY, which every edge function has. Deployed with
// "Verify JWT" off: the mail provider sends no sign-in token.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SITE = "https://louisvillefoodsafe.netlify.app";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const reply = (status: number, text: string) =>
  new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!UUID.test(token)) return reply(400, "Bad token");

  if (req.method === "GET" || req.method === "HEAD") {
    return new Response(null, {
      status: 303,
      headers: { Location: `${SITE}/?unsubscribe=${encodeURIComponent(token)}` },
    });
  }
  if (req.method !== "POST") return reply(405, "Method not allowed");

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { error } = await supabase.rpc("unsubscribe_by_token", { p_token: token });
  // The token is a secret: never log it.
  if (error) {
    console.error("unsubscribe failed:", error.message);
    return reply(500, "Try again later");
  }
  return reply(200, "Unsubscribed");
});
