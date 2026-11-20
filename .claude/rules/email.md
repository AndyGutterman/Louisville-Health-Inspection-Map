---
paths:
  - "pipeline/digest/**"
  - "packages/core/email/**"
  - "apps/web/src/features/admin/**"
  - "apps/web/src/api/admin.js"
  - "apps/web/src/lib/{adminEmail,digest,deepLink}.js"
  - "supabase/functions/**"
  - ".github/workflows/{digest,email-outbox}.yml"
---

# Email: the weekly digest, the admin page and the edge functions

Read `docs/DIGEST.md` and `docs/EMAIL_ADMIN.md` first.

- **The outbox workflow's log is public: never print an address in `pipeline/digest/`** (the `no-addresses-in-digest-logs` rule). Log a count or an id.
- **Weekly digest:** `pipeline/digest/`, `digest.yml` (Tuesdays), `profiles.alert_frequency = 'weekly'`, `lib/digest.js`, `lib/deepLink.js` (`/?eid=`, `/?page=learn`). Each of a subscriber's watch areas is its own part of the email (`digest_watch_areas`, migration `20261124000000`, a few rows per area), below their saved places inspected that week (`digest_saved_places`, migration `20261128000000`); the email names each place once (`oncePerEmail`). A run of the workflow by hand goes only to the owner (`audience: me`, the `DIGEST_TEST_TO` secret) unless `audience` is changed; `dry_run` attaches the email instead of sending.
- **Language:** the email goes out in the subscriber's language: `profiles.language` (`en`/`es`, migration `20261129000000_digest_language.sql`), `packages/core/email/words.js` (tested word list; `renderDigest`/`renderCustom` take `lang`). `pipeline/digest` renders each copy in the recipient's language; the admin preview shows and uses it.
- **Email admin page:** `/?page=admin` (and an "Email admin" button in the Saved panel, for admins only): preview anyone's digest, send tests and one-off emails, see what was sent. `features/admin/`, `api/admin.js`, `lib/adminEmail.js`. It stays English. An admin is a row in `admin_users`, added by hand in SQL; every `admin_*` database function checks it (migration `20261125000000`), so the page hiding things is only a convenience.
- **Sending:** the site only queues a row in `email_jobs`; `pipeline/digest/outbox.js` (`email-outbox.yml`, started by the `email-dispatch` edge function) sends it with the same code as Tuesday's digest (`pipeline/digest/run.js`) and logs each address in `email_deliveries`, so "Send again" never sends twice.
- **The emails are `packages/core/email/`** (`digest.js`, `custom.js`): the preview and the email are one function, so change an email there.
- **Edge functions:** `submit-feedback` (IP rate limit, honeypot, cooldown; `FeedbackModal.jsx` posts to it) and `email-dispatch`, both behind `supabase/functions/_shared/cors.ts`. `unsubscribe` is the one-click unsubscribe (RFC 8058): only a POST unsubscribes (a GET is sent on to the site's `?unsubscribe=` page, for mail apps without one-click), no CORS, used by `List-Unsubscribe` only when the repository variable `ONE_CLICK_UNSUBSCRIBE` is `on` (`pipeline/digest/smtp.js`, `docs/DIGEST.md` "Landing in spam"). `ALLOWED_ORIGIN` must have no trailing slash: one blocked the admin email button and all feedback from June to November 2026. Deploying is the owner's job.
- In e2e: `openApp(page, { answers: { "rpc/is_admin": true } })` plus `mockAuth`/`signIn` (`e2e/admin.spec.js`).
