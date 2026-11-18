# The weekly digest email

One email a week to everyone who subscribed: this week's inspections, the ones that
scored under 85 or got a C placard, the perfect scores, a button to the map. Anyone with
saved places or watch areas also gets those first, as their own parts of the email (see
"Saved places" and "Watch areas"), and the email names each place only once. Tuesdays at
11:00 UTC (6 or 7 am in Louisville) from `.github/workflows/digest.yml`.

## How it works

- **Who gets it:** `profiles.alert_frequency = 'weekly'`. The sign-in form has a checkbox
  (on by default) that is applied once the account exists (`lib/digest.js`,
  `AuthContext.jsx`); the Saved panel has a toggle. The unsubscribe link in the footer
  carries `profiles.digest_token` and calls `unsubscribe_by_token` (no sign-in needed).
- **What it says:** `packages/core/email/digest.js`, pure, from the last 7 days of
  `get_whats_new(2000)` (the window is part of the request, so only those rows are
  downloaded). Tested in `packages/core/tests/email_digest.test.js`. The site's email
  admin page previews anyone's digest with the same function (`docs/EMAIL_ADMIN.md`).
- **Sending:** `pipeline/digest/send.js` builds the job and `pipeline/digest/run.js` sends
  it, the same code that sends what the admin page queues. Each send is logged
  (`email_jobs`, one row per address in `email_deliveries`), so it shows on the admin
  page's Sent tab and a run that died part-way can be finished from there. On a database
  without those tables the email still goes out, unlogged. It goes over SMTP (`SMTP_SERVER`, port 587). It logs in
  as `DIGEST_SMTP_USERNAME` / `DIGEST_SMTP_PASSWORD` when both secrets are set (the
  project's own Gmail, louisvillefoodsafe@gmail.com, with a Gmail app password), and
  otherwise as the backup job's `SMTP_USERNAME` / `SMTP_PASSWORD`. Gmail rewrites the From
  line to the logged-in account, so the login decides the sender; `DIGEST_FROM` only
  changes the display name. Gmail's SMTP allows about 500 messages a day.
- **Links:** `/?eid=<id>` opens that place on the map, `/?page=learn` the Learn page
  (`lib/deepLink.js`).

## Saved places

Someone with saved places gets "Your saved places" at the top of the email: the ones that
were inspected this week, failing first, then most violations ("1 of your 12 saved places
was inspected this week"), or a line saying none was. `digest_saved_places` (migration
`20261128000000`) returns only the saved places that were inspected, with the person's
count of saved places, in one read for the whole send. The admin page previews it with
`admin_digest_saved_places`. On a database without that function the email goes out
without this part, and the run's log says so.

**Ready for several lists.** Saved places come back grouped by list (`list_id`,
`list_name`, both null today: every account has one list). If accounts can one day keep
several (say, for a paid tier), each list is its own part of the email ("Your list · Date
night", "1 of 4 places in this list was inspected this week") with no change to the email
code or the function's columns: only the function's query and a `watchlist.list_id`
column would change.

**Each place once.** A saved place listed here is left out of the watch areas and of the
shared lists below it, and a place in two watch areas is listed in the first
(`oncePerEmail` in `packages/core/email/digest.js`). Totals stay whole: an area says "5
inspections this week (1 shown above)", and the subject counts every failing inspection.

## Watch areas

Someone with watch areas (up to 3, Saved panel) gets each one as its own part of the
email, above the part everyone gets: the area's name and size, how many inspections it had
this week, and its places, failing first, then most violations. An area with nothing
inspected says so. `digest_watch_areas` (migration `20261124000000`) returns at most 8
places per area with the area's totals, in one read for the whole send, so the job
downloads a few rows per area. On a database without that function the email goes out
without these parts, and the run's log says so.

## Language

Each email goes out in its subscriber's language, English or Spanish (`profiles.language`,
default `en`; migration `20261129000000_digest_language.sql`, which the owner runs).

- Set when someone **signs up** from the Spanish site (a brand-new account only; the site
  remembers its language when the code is asked for), and when a signed-in subscriber
  accepts the offer to get the email in the site's language. That offer appears once, right
  after they switch the site's language to one their email isn't in (`DigestLanguageOffer.jsx`),
  and stays in the Saved panel. Nobody else sees it.
- The wording is `packages/core/email/words.js`, a tested word list for both languages;
  `renderDigest` and `renderCustom` take `lang`. Place names, addresses and county names stay
  as published, and a one-off email's message is as written (only its frame, button and
  footer are translated). `pipeline/digest/run.js` renders each copy in the recipient's own
  language; a digest sent "as" someone is in their language, whoever receives it.
- The email admin page shows each person's language in the list and the preview.
- No extra reads: `language` rides along on the subscriber read (`store.subscribers()`).
  The site reads one row of `profiles` (one column) only when a signed-in person opens Saved
  or switches the language.

## Sending a test to yourself

The easy way is the email admin page (`/?page=admin`, `docs/EMAIL_ADMIN.md`): pick anyone,
see their digest, "Send me this as a test". The workflow still works too.

In the GitHub app or site: Actions, "Weekly digest email", Run workflow. **A run by hand
goes only to you** unless you change "audience", so a test can't email everyone.

- **audience**
  - `me` (the default): one email, to the `DIGEST_TEST_TO` secret. Set that secret to the
    email you sign in to the site with, and the test shows your own watch areas. Without
    the secret it goes to the account the digest sends from (louisvillefoodsafe@gmail.com).
  - `group`: the comma-separated addresses in **to**. Addresses typed there show in the
    run's public log, which is why `me` reads a secret instead.
  - `everyone`: every subscriber, the same as Tuesday's run.
- **dry_run** on: nothing is sent; the email is attached to the run as the
  `digest-preview` artifact. Download it and open the HTML in a browser.
- **days**: widen the window (say 14) when a week is quiet.

Test sends say "[Test]" in the subject. An address with an account gets that account's
watch areas; one that isn't subscribed gets no unsubscribe link.

Locally, from `pipeline/`: `node digest/send.js --dry-run` writes `digest-preview.html`;
`node digest/send.js --to=you@example.com --test` sends one.
