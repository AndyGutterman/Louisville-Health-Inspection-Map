---
paths:
  - "apps/web/src/{AuthContext,FeedbackModal,DigestLanguageOffer}.jsx"
  - "apps/web/src/features/learn/LoginModal.jsx"
  - "apps/web/src/features/privacy/**"
  - "apps/web/src/lib/{supabase,privacy}.js"
  - "apps/web/src/api/account.js"
  - "docs/PRIVACY.md"
---

# Sign-in, feedback and the privacy page

- **Auth:** Supabase email one-time **6-digit code** (not the magic link). `AuthContext.jsx` exposes the single client from `lib/supabase.js`. For local magic links to work, `http://localhost:5173/**` must be in Supabase Redirect URLs; the code flow avoids that.
- **Feedback:** `FeedbackModal.jsx` posts to the `submit-feedback` edge function (IP rate limit, honeypot, cooldown).
- **Language at sign-up:** sign-up from the Spanish site saves `es`; a signed-in subscriber who switches language is offered the email in it once (`DigestLanguageOffer.jsx`), and the Saved panel always shows the choice.
- **Privacy page:** `/?page=privacy`, `features/privacy/PrivacyPage.jsx` (its own chunk), linked from the sign-in form, the feedback form, Saved, the Learn page and every email's footer. Every line on it has to stay true: when the site stores something new about a person, sends data to a new service or adds analytics, update the page and the date in `lib/privacy.js`. `docs/PRIVACY.md` maps each statement to the code, and lists every localStorage key (the `storage-keys-documented` rule).
- **What the page may promise:** only what the site does by itself. No promise that needs a person to keep it: no contact inbox, no deadline, no "ask and it will be deleted", no "you will be told" (owner's call, 2026-11-17). It says an account can't be deleted yet.
