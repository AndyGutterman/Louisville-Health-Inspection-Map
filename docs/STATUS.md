# Status: what's merged, what's open, what's next

This is the project's moving part, kept out of `CLAUDE.md` so that file stays rules only. Read it at the start of a session, check it against `git log --oneline -20`, and update it in the same pull request that changes what it says. The `keeper` agent flags drift here every week.

Last brought up to date: 2026-11-19 (pull requests up to #95 merged).

## Recently merged

- **#95** The portal is paused (see `.claude/rules/counties.md`).
- **#94** Search toggles: names or addresses only.
- **#93** CLAUDE.md state after the overnight run.
- **#92 Accessibility part 2:** 320px reflow, reduced motion, dialog focus (`hooks/useDialogFocus.js`), 24px tap targets; `e2e/a11y-part2.spec.js`.
- **#91 Violation rings:** Louisville amber-red, every other county goldenrod (`features/map/mapLayers.js`).
- **#90 Shelby and Spencer** from Kentucky's portal, like Oldham; off since #95.
- **#89 Spanish** (issue #7): every interface string and the weekly email in English and Spanish; the privacy page says the language is stored (`PRIVACY_UPDATED` 2026-11-19).

## Open

- **#100** The review team: rule checks, agents, `/ship`, hooks.
- **#101** Stronger agents and guard, and this file (stacked on #100: merge it into #100, then #100).

## Where things stand

- The refactor (`docs/REFACTOR_PLAN.md`): phases 0, 1, 2, 4 and 5 are done, phase 6 nearly (every big component is split into `features/`); phase 3 (the pipeline) is left.
- Tests: about 454 website unit and component tests, 73 in `packages/core`, 211 in the pipeline, the rule and guard tests, and about 213 Playwright runs (desktop and phone) including axe (`e2e/a11y.spec.js`, in Spanish too) and `a11y-part2.spec.js`. Lint has 0 warnings.
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
3. Run the migrations not yet run: `20261126000000_drop_redundant_indexes.sql`, `20261127000000_drop_unused_objects.sql`, `20261128000000_digest_saved_places.sql`, **`20261129000000_digest_language.sql`** (adds `profiles.language`; until it runs every email is English and the language offer stays hidden) and `20261201000000_portal_off.sql`, if it hasn't run.
4. Netlify: delete the unused `GEOAPIFY_KEY` variable (the site uses `VITE_GEOAPIFY_KEY`).
5. Decide whether approximate Bullitt pins (`ky911-approx`) should look different (`docs/BULLITT.md`, Decisions 9).
6. Look at the ring colours (#91) and the larger score switches (#92) on a phone.
7. Have a Spanish speaker skim `lib/strings*.js`, `packages/core/email/words.js` and the Spanish privacy text.

## Code, next in line

1. **Spanish leftovers:** raw Supabase error text still shows as received; a real screen-reader pass in Spanish.
2. **Accessibility, still by hand** (`docs/ACCESSIBILITY.md`, "Not checked yet"): VoiceOver and TalkBack on the dialogs and the bottom sheet.
3. **Pipeline (refactor phase 3):** the known bugs are in `.claude/rules/data.md`. From a machine that can run against the database, dry run first, and only once egress has reset. Also: the portal's Jefferson data could become Jefferson's fallback (not connected; `docs/COUNTIES.md`), only with permission for the portal.
4. **Phase 6 leftovers:** split `ScoreThreshold.jsx`; CSS clean-up; a component test for the info drawer (like `WhatsNew.test.jsx`).
5. **Egress audit:** find what used 5 GB this cycle (the daily chart first), and keep a fresh map load and Table View as small as they can be. Two whole-view reads are excused with `check-allow` in `api/bullitt.js` and `api/portal.js`: start there.
6. Maybe, only with permission for the portal: Hardin County (`docs/COUNTIES.md`); showing portal counties in Table View, Saved and What's New.
7. Later: consider TypeScript.
