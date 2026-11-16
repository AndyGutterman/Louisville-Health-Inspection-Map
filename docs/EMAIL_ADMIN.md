# Email admin

A page on the site, for the owner only, at **`/?page=admin`** (or the "Email admin" button
in the Saved panel, which only an admin sees). It does four things:

- **Digest:** pick any account and see their weekly digest exactly as Tuesday's send would
  write it (their watch areas included). Send it to yourself as a test, send it to them,
  put them on or take them off the digest, or send this week's digest to every subscriber
  now.
- **Write:** a one-off email in the same card as the digest. Plain text in, with a live
  preview. To yourself, to a few addresses, or to every subscriber.
- **Sent:** everything sent or waiting, Tuesday's sends included: who got it, what failed,
  "Send again" for the ones that didn't get it.

## How it is locked down

Sign-in is the site's usual one (a 6-digit code by email). What makes an account an admin
is a row in the `admin_users` table, and **nothing can read or write that table through
the site's API**: a row is added by hand in the Supabase SQL editor.

- The page calls the database's `admin_*` functions as the signed-in person. Each one
  checks `auth.uid()` against `admin_users` before doing anything. For anyone else the
  reads return nothing and the writes raise "Admins only". Hiding the page is a
  convenience; the database is the lock.
- `email_jobs` and `email_deliveries` have no API access at all. The site reaches them
  only through those functions; the sender uses the service-role key (a GitHub secret).
- The page never sees an unsubscribe token, an SMTP password or the service-role key.
- An admin account is as safe as its email inbox, since that is where the sign-in code
  goes. Use an address with two-step verification.

Guards against a slip or a runaway page: an email to every subscriber needs the number of
subscribers typed in, and the database refuses if that number has changed or another such
email is already on its way; one job takes 20 addresses at most; 30 jobs an hour at most;
a job that waited in the queue for a day is marked expired, not sent.

## How an email gets sent

```
admin page ── admin_queue_email ──▶ email_jobs (queued)
     │
     └─ email-dispatch (edge function) ──▶ GitHub: "Email outbox" workflow
                                                │
                    pipeline/digest/outbox.js ◀─┘  takes the job, sends over SMTP,
                                                   logs each address in email_deliveries,
                                                   marks the job sent / partial / failed
```

- The site only queues. Sending is the same code and the same SMTP secrets as the weekly
  digest (`pipeline/digest/run.js`), so there is one place email leaves from.
- `supabase/functions/email-dispatch` only starts the workflow, after checking the caller
  is an admin. Without it (or without its GitHub token) the job stays queued and the page
  says so, with a link to start **Actions → Email outbox → Run workflow** by hand.
- Each address is logged as it is sent. If a run dies part-way, "Send again" sends only to
  the addresses that haven't got it. Tuesday's send is logged the same way.
- The emails themselves are in `packages/core/email/` (`digest.js`, `custom.js`), shared
  by the site and the pipeline: the preview and the email are the same function.
- The workflow's log is public, so the sender never prints an address there. Who got what
  is on the Sent tab.

Egress: opening the page reads the week's inspections once (the digest's window of
`get_whats_new`, filtered in the database: 136 rows on 2026-11-16, a few tens of KB) and a page of
accounts. The Sent tab checks back every 6 seconds only while something is on its way,
for 4 minutes at most.

## Setting it up (once)

1. **Database.** In the Supabase SQL editor, run
   `supabase/migrations/20261125000000_email_admin.sql`. If you haven't yet, also run
   `20261124000000_digest_watch_areas.sql` (without it, emails and previews have no
   watch-area parts).
2. **Make yourself the admin.** Sign in to the site once so your account exists, then run
   this with your sign-in email. It should say `INSERT 0 1`:

   ```sql
   INSERT INTO public.admin_users (user_id, note)
   SELECT id, 'owner' FROM auth.users WHERE lower(email) = lower('you@example.com')
   ON CONFLICT (user_id) DO NOTHING;
   ```

   The page works from here: previews, queueing, the Sent tab. Emails wait in the queue
   until the workflow is started by hand. The next two steps make sending immediate.

3. **A GitHub token for the dispatch function.** GitHub → Settings → Developer settings →
   Fine-grained tokens → Generate new token. Repository access: only this repository.
   Permissions: **Actions: Read and write**. Nothing else.
4. **The edge function.** Deploy `supabase/functions/email-dispatch` (Supabase dashboard →
   Edge Functions, or `supabase functions deploy email-dispatch`), leaving "Verify JWT"
   on. Then, under Edge Functions → Secrets, add `GITHUB_DISPATCH_TOKEN` with the token
   from step 3.

Nothing changes on Netlify, and no new GitHub secret is needed: the outbox workflow uses
the digest's.

## Checking it

- Signed out, `/?page=admin` shows only "Log in". Signed in as anyone else it says
  "Admins only".
- On the Digest tab, "Send me this as a test". The Sent tab should go Queued → Sending →
  Sent within a minute or two, and the email arrives marked "[Test]".
- In the SQL editor, `SELECT status, kind, audience, sent_count FROM email_jobs ORDER BY created_at DESC LIMIT 5;`
  shows the same history.

## Removing an admin, or everything

`DELETE FROM public.admin_users WHERE user_id = '<uuid>';` takes an admin away at once.
Deleting the `GITHUB_DISPATCH_TOKEN` secret (or the token on GitHub) stops the site from
starting the workflow.
