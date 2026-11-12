# The weekly digest email

One email, the same for everyone who subscribed: this week's inspections, the ones that
scored under 85 or got a C placard, the perfect scores, a button to the map. Tuesdays at
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

## Trying it without emailing everyone

In the Actions tab, run "Weekly digest email" by hand:

- **dry_run** on: nothing is sent; the email is attached to the run as the
  `digest-preview` artifact. Download it and open the HTML in a browser.
- **to**: a comma-separated list of addresses. Only those get the email, whether or not
  they subscribed (non-subscribers get no unsubscribe link). Use this to see it in a real
  inbox before the first Tuesday.
- **days**: widen the window (say 14) when a week is quiet.

Locally, from `pipeline/`: `node digest/send.js --dry-run` writes `digest-preview.html`;
`node digest/send.js --to=you@example.com` sends one.
