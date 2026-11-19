# Privacy page: keeping it true

The page visitors read is `apps/web/src/features/privacy/PrivacyPage.jsx` (`/?page=privacy`,
linked from the sign-in form, the feedback form, Saved, the Learn page and every email's
footer). This file is for whoever maintains the site: where each statement comes from, and
what the page deliberately leaves out.

It is a plain-words notice, not legal advice. The site is free, has no ads and targets
Kentucky, so no law clearly requires one; it is there because the site asks for emails
and stores watch areas, which for most people are their home.

## When to update it

The page is in English and Spanish (`apps/web/src/lib/strings.pages.js`, keys `privacy.*`): every statement must be changed in both. Change the page, and the date in `apps/web/src/lib/privacy.js` (an ISO date, shown per language), whenever the site starts
to store something new about a person, sends data to a new service, or adds analytics.

| The page says                                       | Where that is in the code                                                                                                                            |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| No analytics, no tracking cookies                   | Nothing of the kind in `apps/web` (`git grep -i "analytics\|gtag" apps/web`)                                                                         |
| Settings and map data kept on the device            | localStorage: `lfs_counties`, `lfs_categories`, `lfs_geodata_*`, `lfs_digest_optin`, `lfs_lang`, `lfs_signup_lang`, `lfs_digest_lang_offered`        |
| An account stores email, saved places, watch areas  | `profiles`, `watchlist`, `watchlist_areas` (the baseline migration)                                                                                  |
| The language you chose is stored with the account   | `profiles.language`, written when someone signs up from the site or accepts the offer to get the weekly email in their language; the digest reads it |
| A record of emails sent                             | `email_jobs`, `email_deliveries` (migration `20261125000000`)                                                                                        |
| Feedback keeps browser type and a scrambled IP      | `supabase/functions/submit-feedback` (`user_agent`, `ip_hash`; the spam limit counts `ip_hash` in the same table)                                    |
| The owner can see emails, saved places, watch areas | The email admin page and the Supabase dashboard (`docs/EMAIL_ADMIN.md`)                                                                              |
| Supabase, Netlify, Google, Geoapify, CARTO          | `lib/supabase.js`, `netlify.toml`, the digest's SMTP and `index.html`'s fonts, `AddressPicker.jsx`, the basemap style                                |

## What the page does not promise, on purpose

The page only says what the site does by itself (the owner's call, 2026-11-17). It gives
no contact address, no deadline, no "ask and it will be deleted", and no promise to tell
anyone when it changes. It says plainly that an account can't be deleted yet. Don't add a
sentence that needs a person to keep it; if something should be promised, build it first
(a "Delete my account" button in Saved is the obvious one) and then describe it.

## If someone asks to be deleted anyway

Nothing obliges it, but it takes two minutes if you choose to. A request would arrive
through the Feedback form.

1. Supabase dashboard, Authentication, Users: find the email and delete the user. Their
   profile, saved places and watch areas go with it (each table's `user_id` cascades).
2. In the SQL editor, clear the email log and any feedback they sent (put their address in):

   ```sql
   DELETE FROM public.email_deliveries WHERE email = lower('them@example.com');
   UPDATE public.email_jobs
      SET to_emails = array_remove(to_emails, 'them@example.com')
    WHERE 'them@example.com' = ANY (to_emails) AND array_length(to_emails, 1) > 1;
   DELETE FROM public.email_jobs
    WHERE to_emails = ARRAY['them@example.com'];
   DELETE FROM public.feedback WHERE lower(email) = lower('them@example.com');
   ```
