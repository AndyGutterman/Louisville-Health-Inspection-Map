# The weekly digest email

One email a week to everyone who subscribed: this week's inspections, the ones that
scored under 85 or got a C placard, the perfect scores, a button to the map. Anyone with
watch areas also gets each area as its own part of the email (see "Watch areas"). Tuesdays at
11:00 UTC (6 or 7 am in Louisville) from `.github/workflows/digest.yml`.

## How it works

- **Who gets it:** `profiles.alert_frequency = 'weekly'`. The sign-in form has a checkbox
  (on by default) that is applied once the account exists (`lib/digest.js`,
  `AuthContext.jsx`); the Saved panel has a toggle. The unsubscribe link in the footer
  carries `profiles.digest_token` and calls `unsubscribe_by_token` (no sign-in needed).
- **What it says:** `pipeline/digest/render.js`, pure, from `get_whats_new(2000)` filtered
  to the last 7 days. Tested in `pipeline/tests/digest_render.test.js`.
- **Sending:** `pipeline/digest/send.js` over SMTP (`SMTP_SERVER`, port 587). It logs in
  as `DIGEST_SMTP_USERNAME` / `DIGEST_SMTP_PASSWORD` when both secrets are set (the
  project's own Gmail, louisvillefoodsafe@gmail.com, with a Gmail app password), and
  otherwise as the backup job's `SMTP_USERNAME` / `SMTP_PASSWORD`. Gmail rewrites the From
  line to the logged-in account, so the login decides the sender; `DIGEST_FROM` only
  changes the display name. Gmail's SMTP allows about 500 messages a day.
- **Links:** `/?eid=<id>` opens that place on the map, `/?page=learn` the Learn page
  (`lib/deepLink.js`).

## Watch areas

Someone with watch areas (up to 3, Saved panel) gets each one as its own part of the
email, above the part everyone gets: the area's name and size, how many inspections it had
this week, and its places, failing first, then most violations. An area with nothing
inspected says so. `digest_watch_areas` (migration `20261124000000`) returns at most 8
places per area with the area's totals, in one read for the whole send, so the job
downloads a few rows per area. On a database without that function the email goes out
without these parts, and the run's log says so.

## Sending a test to yourself

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
