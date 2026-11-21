# Status: what's merged, what's open, what's next

This is the project's moving part, kept out of `CLAUDE.md` so that file stays rules only. Read it at the start of a session, check it against `git log --oneline -20`, and update it in the same pull request that changes what it says. The `keeper` agent flags drift here every week.

Last brought up to date: 2026-11-20 (pull requests up to #107 merged).

## Recently merged

- **#107** The digest lands in spam: one-click unsubscribe, list headers (`docs/DIGEST.md`, "Landing in spam").
- **#106** Email admin, round two: scheduled one-off emails, older sends, the digest pause (`docs/EMAIL_ADMIN.md`).
- **#105** Indiana neighbours checked, none usable (`docs/COUNTIES.md`).
- **#102** Learn page: violation chips show their citation share, not scores.
- **#100, #101** The review team: rule checks, agents, `/ship`, hooks, and `.claude/rules/`.
- **#96–#98** The pin control center (`/?page=pins`, `docs/PINS.md`): hand fixes per place, and Geocode now.
- **#95** The portal is paused (see `.claude/rules/counties.md`).
- **#94** Search toggles: names or addresses only.
- **#93** CLAUDE.md state after the overnight run.
- **#92 Accessibility part 2:** 320px reflow, reduced motion, dialog focus (`hooks/useDialogFocus.js`), 24px tap targets; `e2e/a11y-part2.spec.js`.
- **#91 Violation rings:** Louisville amber-red, every other county goldenrod (`features/map/mapLayers.js`).
- **#90 Shelby and Spencer** from Kentucky's portal, like Oldham; off since #95.
- **#89 Spanish** (issue #7): every interface string and the weekly email in English and Spanish; the privacy page says the language is stored (`PRIVACY_UPDATED` 2026-11-19).

## Open

- **Ingest when changed** (`feat/ingest-when-changed`): Louisville and Bullitt are checked every two hours and load only when the source changed (Louisville's check reads nothing from the database); visitors' saved pins refresh after a load (`data_loads`, migration `20261203000000`), not at a fixed hour.

## Where things stand

- The refactor (`docs/REFACTOR_PLAN.md`): phases 0, 1, 2, 4 and 5 are done, phase 6 nearly (every big component is split into `features/`); phase 3 (the pipeline) is left.
- Tests: about 454 website unit and component tests, 73 in `packages/core`, 211 in the pipeline, the rule and guard tests, and about 213 Playwright runs (desktop and phone) including axe (`e2e/a11y.spec.js`, in Spanish too) and `a11y-part2.spec.js`. Lint has 0 warnings.
- **Indiana neighbours checked (2026-11-19):** Floyd posts reports, but in.gov's terms forbid republishing them; Clark and Harrison post none. None is usable without written permission (`docs/COUNTIES.md`, "Indiana neighbours").
- **Supabase egress went over the free 5 GB in the November 2026 billing cycle** (5.41 GB on 2026-11-18). The daily chart under Usage → Egress shows which day. Make no reads against the project until the cycle resets, and treat new reads with extra care.

## Waiting on the owner

Each needs the dashboard, a deploy or a decision; none can be done from a session.

1. Supabase → Edge Functions → Secrets: `ALLOWED_ORIGIN` must be `https://louisvillefoodsafe.netlify.app` with no trailing slash.
2. Deploy both edge functions after #84, from the repo root:
   ```bash
   npx supabase functions deploy submit-feedback --no-verify-jwt --project-ref iyahhhgqmhbadgczbfwy
   ```
   ```bash
   npx supabase functions deploy email-dispatch --project-ref iyahhhgqmhbadgczbfwy
   ```
   Then delete the `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` secrets, and send a test from the Feedback button.
3. Run the migrations not yet run: `20261126000000_drop_redundant_indexes.sql`, `20261127000000_drop_unused_objects.sql`, `20261128000000_digest_saved_places.sql`, **`20261129000000_digest_language.sql`** (adds `profiles.language`; until it runs every email is English and the language offer stays hidden) `20261201000000_portal_off.sql`, if it hasn't run, and `20261203000000_data_loads.sql` (until it runs, the pipeline logs a warning and visitors' pins refresh once a day at 17:00 UTC).
4. Netlify: delete the unused `GEOAPIFY_KEY` variable (the site uses `VITE_GEOAPIFY_KEY`).
5. Decide whether approximate Bullitt pins (`ky911-approx`) should look different (`docs/BULLITT.md`, Decisions 9).
6. Look at the ring colours (#91) and the larger score switches (#92) on a phone.
7. Have a Spanish speaker skim `lib/strings*.js`, `packages/core/email/words.js` and the Spanish privacy text.
8. **The digest lands in spam** (`docs/DIGEST.md`, "Landing in spam"): deploy the `unsubscribe` edge function, then set the repository variable `ONE_CLICK_UNSUBSCRIBE` to `on`; score a test on mail-tester.com (the Digest tab's "Test to another address", `docs/EMAIL_ADMIN.md`); decide on a domain of our own and an email service (the real fix, and the way to Google Postmaster Tools).

## Code, next in line

1. **Spanish leftovers:** raw Supabase error text still shows as received; a real screen-reader pass in Spanish.
2. **Accessibility, still by hand** (`docs/ACCESSIBILITY.md`, "Not checked yet"): VoiceOver and TalkBack on the dialogs and the bottom sheet.
3. **Pipeline (refactor phase 3):** the known bugs are in `.claude/rules/data.md`. From a machine that can run against the database, dry run first, and only once egress has reset. Also: the portal's Jefferson data could become Jefferson's fallback (not connected; `docs/COUNTIES.md`), only with permission for the portal.
4. **Phase 6 leftovers:** split `ScoreThreshold.jsx`; CSS clean-up; a component test for the info drawer (like `WhatsNew.test.jsx`).
5. **Egress audit:** find what used 5 GB this cycle (the daily chart first), and keep a fresh map load and Table View as small as they can be. Two whole-view reads are excused with `check-allow` in `api/bullitt.js` and `api/portal.js`: start there.
6. Maybe, only with permission for the portal: Hardin County (`docs/COUNTIES.md`); showing portal counties in Table View, Saved and What's New.
7. Later: consider TypeScript.
