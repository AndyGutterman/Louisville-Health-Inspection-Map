# Privacy page: keeping it true

The page visitors read is `apps/web/src/features/privacy/PrivacyPage.jsx` (`/?page=privacy`,
linked from the sign-in form, the feedback form, Saved, the Learn page and every email's
footer). This file is for whoever maintains the site: where each statement comes from, and
what to do when someone asks to be deleted.

It is a plain-words notice, not legal advice. The site is free, has no ads and targets
Kentucky, so no law clearly requires one; it is there because the site asks for emails
and stores watch areas, which for most people are their home.

## When to update it

Change the page, and the date in `apps/web/src/lib/privacy.js`, whenever the site starts
to store something new about a person, sends data to a new service, or adds analytics.

| The page says                                       | Where that is in the code                                                                                                                    |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| No analytics, no tracking cookies                   | Nothing of the kind in `apps/web` (`git grep -i "analytics\|gtag" apps/web`)                                                                 |
| Settings and map data kept on the device            | localStorage: `lfs_counties`, `lfs_categories`, `lfs_geodata_*`, `lfs_digest_optin`                                                          |
| An account stores email, saved places, watch areas  | `profiles`, `watchlist`, `watchlist_areas` (the baseline migration)                                                                          |
| A record of emails sent                             | `email_jobs`, `email_deliveries` (migration `20261125000000`)                                                                                |
| Feedback keeps browser type and a scrambled IP      | `supabase/functions/submit-feedback` (`user_agent`, `ip_hash`), Upstash rate limit                                                           |
| The owner can see emails, saved places, watch areas | The email admin page and the Supabase dashboard (`docs/EMAIL_ADMIN.md`)                                                                      |
| Supabase, Netlify, Google, Geoapify, CARTO, Upstash | `lib/supabase.js`, `netlify.toml`, the digest's SMTP and `index.html`'s fonts, `AddressPicker.jsx`, the basemap style, the feedback function |
| Contact address                                     | `CONTACT_EMAIL` in `apps/web/src/lib/privacy.js`                                                                                             |

## Someone asks to be deleted

The page promises 30 days. It takes two minutes.

1. Check the request came from the account's own address.
2. Supabase dashboard, Authentication, Users: find the email and delete the user. Their
   profile, saved places and watch areas go with it (each table's `user_id` cascades).
3. In the SQL editor, clear the email log and any feedback they sent (put their address in):

   ```sql
   DELETE FROM public.email_deliveries WHERE email = lower('them@example.com');
   UPDATE public.email_jobs
      SET to_emails = array_remove(to_emails, 'them@example.com')
    WHERE 'them@example.com' = ANY (to_emails) AND array_length(to_emails, 1) > 1;
   DELETE FROM public.email_jobs
    WHERE to_emails = ARRAY['them@example.com'];
   DELETE FROM public.feedback WHERE lower(email) = lower('them@example.com');
   ```

4. Reply to say it is done.

Someone asking what is held about them: the same lookups with `SELECT` in place of
`DELETE`, sent back to the account's address.

Not built yet, and worth it if requests ever become regular: a "Delete my account" button
in Saved.
