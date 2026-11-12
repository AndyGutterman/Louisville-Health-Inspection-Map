# Louisville Food Safe: project context for Claude Code

Read this first. It was written on 2026-11-05 from a long chat session and covers what the project is, how it is organized, the decisions made, the gotchas found, and what is left to do. Check `git log` and `git status` before trusting the "state" section: it may be a little behind the repo.

## What this is

An interactive map of health inspection scores for Louisville, KY restaurants and food service places. Live at https://louisvillefoodsafe.netlify.app. It is a solo, open-source project and the owner's flagship résumé project, so code quality, tests, CI and docs matter as much as features. The owner does not expect outside contributors, so do NOT add CONTRIBUTING files, issue or PR templates, or Dependabot.

Data flow: Louisville Metro ArcGIS REST API -> Node pipeline scripts (`pipeline/`) run by GitHub Actions -> Supabase (Postgres, Auth, one Edge Function) -> React site on Netlify.

Stack: React 19, Vite 7, MapLibre GL 5, Supabase (supabase-js), Geoapify (address search), Vitest, ESLint, Prettier, Netlify, GitHub Actions.

A phased readability refactor is in progress: plan, decisions and known bugs are in `docs/REFACTOR_PLAN.md`. Phases 0 and 1 are done (2026-11-06).

## Repo layout (Windows, PowerShell; repo root is `Louisville-Health-Inspection-Map`)

The root is an npm workspace (`apps/web`, `pipeline`) with one `package-lock.json`. Node 22 (`.nvmrc`).

```
apps/web/                 React app (was InspectionWebsite/)
  src/lib/                PURE logic, no React, no map instance. Each file has a *.test.js beside it.
  src/hooks/              shared hooks (useMediaQuery)
  src/styles/             component stylesheets
  src/Map.jsx             the app shell (~400 lines): which panels are open, and the layout
  src/features/map/       the map: useMapLibre (map, pin clicks, outside-click), popups, mapLayers,
                          useMapFeatures (pins), useDrawer (drawer data), useWatchlist, AppHeader
  src/api/                Supabase calls behind the map and drawer (other panels still call it directly)
  src/*.jsx               the other components (InfoDrawer, TableView, WhatsNew, FilterSearch, ...)
pipeline/                 data pipeline + maintenance jobs (was etl/ + scripts/); tests in pipeline/tests (node --test)
supabase/                 migrations (full schema baseline + later changes) and functions/submit-feedback
docs/                     ARCHITECTURE.md (mermaid diagrams), SMOKE_TEST.md (manual checklist), REFACTOR_PLAN.md
.github/workflows/        ci.yml, ingest.yml, db-backup.yml, archive.yml, etl-check.yml, schema-dump.yml
```

`src/lib/` modules: searchText, samePlaceDetection, scoring, categories, dates, dedupe, geocode, bottomSheet, mapBounds, constants.

## Commands (from the repo root)

```
npm ci
npm run dev
npm run lint        # 0 errors expected; 1 known warning (see below)
npm test            # website (vitest, 113 tests in 10 files) and pipeline (node --test, 54 tests)
npm run build
npm run format      # Prettier
npm run e2e         # Playwright smoke tests, desktop + phone (builds the site, ~30s)
```

Workspace-specific: `npm run <script> -w apps/web` or `-w pipeline`. Env vars for the website (see `apps/web/.env.example`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GEOAPIFY_KEY`, `VITE_FEEDBACK_FUNCTION_URL` (optional). CI uses dummy Supabase values. The pipeline reads `pipeline/.env` locally and GitHub secrets in Actions.

## Conventions

- New logic goes in `src/lib/` first, with a test next to it (`foo.js` + `foo.test.js`). Frontend tests are colocated; pipeline tests live in `pipeline/tests/`. Keep that split.
- Component CSS goes in `src/styles/<Component>.css`, imported by the component. No CSS inside JS template strings.
- One concern per commit. Conventional-style messages: `fix(drawer): ...`, `refactor: ...`, `chore: ...`.
- The whole repo is Prettier-formatted (commit `973b174`, listed in `.git-blame-ignore-revs`). Run `npm run format` on files you change.
- Before committing: lint, test, build. If the map, drawer, filters, or What's New changed, also `npm run e2e` and the manual steps of `docs/SMOKE_TEST.md` it doesn't cover.
- Git hygiene: use `git add -A` then `git status --short` before committing. Never `git commit -am` (it skips new files, which has already bitten this repo once). Always give the user commands to run from the repo root, using paths relative to it.
- Reading from the working tree vs HEAD: use `git show HEAD:path` to see committed content.

## Workflow: change requests from the owner's phone

The owner asks for changes from the Claude app on a phone (a Claude Code **cloud session**, with the PC off) and reviews and merges the result as a pull request in the GitHub app. For each request:

1. Start from an up-to-date `main` and create a branch: `fix/...`, `feat/...`, `refactor/...`, `chore/...`, `docs/...` or `test/...`.
2. Make the change, one concern per commit, following the conventions above.
3. Verify before pushing: `npm run lint`, `npm test`, `npm run build`, `npm run e2e`. Look at the JPEGs in `apps/web/e2e/screenshots/` for anything visual; you can read them as images.
4. If the change touches the map, drawer, filters or What's New, add or update a test in `apps/web/e2e/smoke.spec.js`:
   - Select by role or `data-testid`, never by canvas pins.
   - Data comes from `apps/web/e2e/support/fixtures.js` (Supabase is mocked). A new Supabase call needs a fixture entry, or the load test fails on purpose.
5. Push the branch and open a PR against `main`:
   - In a cloud session, use the built-in GitHub tools. `gh pr ...` is blocked there (GraphQL), but the REST API works: `gh api repos/AndyGutterman/Louisville-Health-Inspection-Map/pulls -f title=... -f head=<branch> -f base=main -f body=...`.
   - Locally, `gh pr create` if `gh` is installed; otherwise push and give the owner `https://github.com/AndyGutterman/Louisville-Health-Inspection-Map/compare/main...<branch>?expand=1`.
6. The PR description says, in plain words: what changed and why; what you verified (commands and results); what you could not verify; anything the owner must do (SQL to run in Supabase, Netlify or GitHub settings, secrets).
7. On the PR, `ci.yml` runs lint, tests and the build, and `e2e.yml` runs Playwright against the Netlify deploy preview (or a build inside the job when there is no preview). `e2e.yml` keeps one comment updated with the result and every screenshot inline, phone and desktop; the images live on the `e2e-screenshots` branch (one commit, holding the 20 most recent PRs, so merged PRs keep their pictures). Netlify posts the preview link.
8. Wait for those checks (`gh api repos/AndyGutterman/Louisville-Health-Inspection-Map/actions/runs?branch=<branch>`), then tell the owner in the chat: pass or fail, the PR link, and anything in the screenshots worth a look. If a check fails, fix it on the same branch.
9. The owner reviews and merges; merging to `main` deploys production. In this loop, don't push to `main` or merge your own PR. For database changes, add a migration in `supabase/migrations/` and tell the owner to run it; don't assume it has been run.

### Cloud sessions

- `.claude/hooks/cloud-setup.mjs` runs at session start (a SessionStart hook in `.claude/settings.json`): it runs `npm ci` when `package-lock.json` changed, and says whether the map basemap is reachable. It does nothing locally.
- Playwright uses the preinstalled Chrome (`CHROME_PATH`) in the cloud, and the e2e build gets placeholder Supabase values, so no `.env` is needed.
- The cloud environment's network access must allow `*.cartocdn.com` (the basemap), or the e2e load test fails. If the setup hook reports it unreachable, tell the owner; the PR's e2e workflow still runs the tests.
- There is no `.env` and no database password in the cloud. Anything that needs the real Supabase project (pipeline scripts, SQL) is for the owner to run.

## Things that will bite you (learned the hard way)

- **Click-outside handler:** `closeOnOutsideClick` in `features/map/useMapLibre.js` closes the info drawer on any click outside the `KEEP_DRAWER_OPEN` list (control card, drawer, account panel, table panel, What's New, a few buttons). Any new floating panel or toggle must be added to that list or it will close the drawer.
- **Global CSS leaks into inline-styled elements.** `index.css` has a global `button` rule (padding, background). Inline-styled buttons must set `padding: 0` and sizing explicitly. A selector like `.info-drawer [style]` once forced padding onto every inline-styled element in the drawer and broke the bookmark button; never use broad `[style]` selectors.
- **`!important` beats inline styles.** Check CSS files before debugging layout in JSX.
- **Map event handlers are registered once**, when the map loads. They read current state through `useLatest` (`src/hooks/useLatest.js`). Don't add changing values to the map effect's dependency array in `useMapLibre.js`: that rebuilds the map. The remaining lint warning is in TableView.jsx (`onResize`) and needs a TableView restructure, not a dependency tweak.
- **No "critical" labels:** the data's `critical_yn` flag can't tell the Food Code's three kinds of violation (priority, priority foundation, core) apart, so the site shows every citation as a plain violation and never decides anything from the flag (owner's call, 2026-11-09, for accuracy and liability). Don't bring back critical chips, red rings or critical-first sorting. The database still stores the column; `critical_count`/`critical_6mo` in the functions are deprecated.
- **Same-place detection:** `lib/samePlaceDetection.js` tags both features with each other's info; it never hides or merges pins. The sub-tenant regex must use `\bat\b` style word boundaries (it once contained raw backspace characters, and an older copy matched any name containing "at"). Tests pin this.
- Shell caveat: in the sandbox `sh` was used, so brace expansion and `<( )` fail; prefer explicit paths.

## Key behaviors and where they live

- **Pins and bands:** `lib/scoring.js` (presets loose/balanced/strict, `bandExprs`), colors in `Colors.jsx` (`PIN_COLORS`).
- **Categories:** `lib/categories.js`; a category is a set of (facility type, subtype) pairs. Each pair belongs to exactly one category (tested).
- **Same-coordinate pins:** `lib/dedupe.js` collapses to the worst establishment, keeps others searchable.
- **Info drawer:** `InfoDrawer.jsx`. Desktop is a side panel. On phones (max-width 600px) it is a bottom sheet with two heights, peek (about 1.5 history rows) and expanded (about 74% of the screen), dragged by a handle; rules in `lib/bottomSheet.js`. Dragging well below peek, or flinging down from peek, closes it.
- **Records with no map pin:** What's New rows with no coordinates still open the drawer (flagged `noLocation`, shows "No map location on file"), and the map does not move.
- **Phone layering:** `mobileTop` state in Map.jsx ("account" or "drawer"). Opening Saved goes over the map and over any open drawer; tapping a record in Saved opens the drawer on top and replaces any drawer already open; closing the drawer leaves Saved open. Account page z-index is 3300 when on top, 50 otherwise.
- **Header button** says "Saved" (class `header-nav-btn--account`); the panel title still says "My Account".
- **Watch areas:** `watchAreaLayer.js` (circles, editor popup with drag handles). Clicking the popup card (not its buttons) opens the Saved panel scrolled to that area (`openWatchPanelRef`, `focusArea`). Default sort in a watch area is "Violations" (most violations first, then failing grade; `lib/watchAreaSort.js`). Watch areas and saved places cover both counties (migration `20261111000000_both_counties.sql`).
- **Pan limits:** `lib/mapBounds.js` widens the old fixed box by an amount that scales with the window, so pins under side panels can be panned into view.
- **Auth:** Supabase email one-time **6-digit code** (not the magic link). `AuthContext.jsx` exposes the single client from `lib/supabase.js`. For local magic links to work, `http://localhost:5173/**` must be in Supabase Redirect URLs; the code flow avoids that.
- **Feedback:** `FeedbackModal.jsx` posts to the `submit-feedback` edge function (IP rate limit, honeypot, cooldown).
- **Weekly digest email:** `docs/DIGEST.md`. `pipeline/digest/`, `digest.yml` (Tuesdays), `profiles.alert_frequency = 'weekly'`, `lib/digest.js`, `lib/deepLink.js` (`/?eid=`, `/?page=learn`). Test-fire with the workflow's `to` input or `dry_run`.
- **Date filter and map cache constants:** `lib/constants.js`.
- **Bullitt County:** read `docs/BULLITT.md` first. Separate `bullitt_*` tables, `pipeline/regions/bullitt/`. Both counties' pins show at once (no toggle); Bullitt pins pass the date filter and show only while every category is on, since they have no facility types (`lib/mapFilters.js` `categoryFilter`). Per-county capabilities, agency and data sources in `lib/regions.js` (`has`, `agency`, `source`, `dataNote`; the Learn page shows one link and a data note per county). Geocoding order and the redo switch: `docs/BULLITT.md`. Bullitt ids start with `bullitt-` (`lib/bullitt.js`). What's New has three tabs, Latest (`get_latest_inspections`, the same rows as `get_whats_new` by date), Violations (`get_whats_new`, failing first) and Top Scores (`get_top_scores`), listed in `lib/whatsNew.js` `WHATS_NEW_TABS`; all include Bullitt; undated rows say "posted <date>" (`lib/whatsNew.js`).
- **Table View:** reads `v_table_latest` / `v_table_inspections` (both counties). It loads nothing until first opened and asks for a row count only when filters change (`lib/tableQuery.js`). On phones, filters fold behind a button and rows are cards. Facility chips only filter Jefferson (Bullitt has no types): picking one switches County to Jefferson; picking Bullitt shows a note instead of chips.
- **Search:** `lib/searchText.js`, used by the map (`search_key` on each pin, built in `lib/dedupe.js`, matched in `lib/mapFilters.js`) and Table View (`searchFilters` in `lib/tableQuery.js`, a PostgREST `imatch` regex per word). Case, spacing, punctuation and accents are ignored, and every word must match, so "mcdonalds", "Mc Donald's" and "mc'donalds" all find every McDonald's in both counties. No database change.
- **Map popups** sit under every panel: `.map-container` has `z-index: 0`, so it is its own stacking context.

## Decisions already made

- No contributor scaffolding (see above). Keep `docs/ARCHITECTURE.md` and `docs/SMOKE_TEST.md`.
- Header label is "Saved" (alternatives considered: Watch, Account, My Places, Watchlist, Alerts).
- Swipe-to-close on the phone drawer is on; the owner may turn it off.
- Prettier: done for the whole repo in one commit, CSS and Markdown included (the earlier recommendation to skip CSS was not followed).

## State (verify with git)

Applied and committed: lint cleanup, same-place extraction, scoring/categories/dates/dedupe/geocode extraction, shared `useMediaQuery`, phone bottom sheet and layering, outside-click fix for What's New, scaled pan limits, Vitest and CI, "round 9" (component CSS in `src/styles/`, constants in `lib/constants.js`, root README), refactor phases 0 and 1 (schema baseline in `supabase/migrations/`, workspace layout, Prettier), the feedback RLS fix, the nightly-backup fix, the phone PR workflow with Playwright, and the Map.jsx split into `features/map/` (2026-11-08).

## To do, in rough order

1. `git rm docs/good-first-issues.md`. Delete `apps/web/src/styles/App.css`, `apps/web/src/assets/react.svg`, `apps/web/public/vite.svg` only if `git grep -n "App.css\|react.svg\|vite.svg" apps/web` shows no real uses.
2. Add a `LICENSE` file (MIT; README already says MIT). Add screenshots at `docs/images/desktop.png` and `mobile.png` (no personal info such as emails in them) and uncomment them in the README.
3. Add `npm run format:check` to `ci.yml`.
4. Coverage: `npm i -D @vitest/coverage-v8@5.1.0 -w apps/web` (must match the installed vitest), add script `"test:coverage": "vitest run --coverage"`. Coverage of `src/lib` was about 99% lines; components are untested, so describe any badge as logic-layer coverage. Codecov is optional.
5. Tests for fixed bugs: pull the What's New outside-click rule into a small testable function; add a few Testing Library component tests (drawer, What's New including the no-pin row). Needs jsdom.
6. Refactor phases 2 to 4 and 6 to 7 in `docs/REFACTOR_PLAN.md` (shared `packages/core`, pipeline restructure, `api/` for the other panels). The Map.jsx split (phase 5) is done.
7. Cleanup candidates: leftover "get placard alerts" and "Unsubscribe anytime" text in `LearnPage.jsx` (the feature does not exist; check with `git grep -n -i "unsubscribe anytime\|placard alerts" apps/web/src`), and the dead unsubscribe-link handler in `AuthContext.jsx` (`unsubscribe_by_token` does not exist in the database).
8. Later: consider TypeScript after the split.

## Working with the owner

Prefers concise, warm, punchy communication that does not sound like an AI, and pushes back on anything long-winded or over-promised. Gets confused by paths and git state, so always say where to run a command, show exact commands, and tell him what the output should look like. Explain "why" briefly before changing something non-obvious. Verify claims against the code instead of guessing; several early assumptions in this project turned out to be wrong and were caught only by reading the files.
