# Louisville Food Safe: project context for Claude Code

Read this first. It was written on 2026-11-05 from a long chat session and covers what the project is, how it is organized, the decisions made, the gotchas found, and what is left to do. Check `git log` and `git status` before trusting the "state" section: it may be a little behind the repo.

## What this is

An interactive map of health inspection scores for Louisville, KY restaurants and food service places. Live at https://louisvillefoodsafe.netlify.app. It is a solo, open-source project and the owner's flagship résumé project, so code quality, tests, CI and docs matter as much as features. The owner does not expect outside contributors, so do NOT add CONTRIBUTING files, issue or PR templates, or Dependabot.

Data flow: Louisville Metro ArcGIS REST API -> Node ETL scripts (`etl/`) run by GitHub Actions -> Supabase (Postgres, Auth, one Edge Function) -> React site on Netlify.

Stack: React 19, Vite 7, MapLibre GL 5, Supabase (supabase-js), Geoapify (address search), Vitest, ESLint, Prettier (configured, not yet run), Netlify, GitHub Actions.

## Repo layout (Windows, PowerShell; repo root is `Louisville-Health-Inspection-Map`)

```
InspectionWebsite/        React app (all frontend commands run here)
  src/lib/                PURE logic, no React, no map instance. Each file has a *.test.js beside it.
  src/hooks/              shared hooks (useMediaQuery)
  src/styles/             component stylesheets
  src/*.jsx               components. Map.jsx is the app shell and the map (~1,900 lines, being split up)
etl/                      data pipeline (own package; tests in etl/tests, run with node --test)
scripts/                  maintenance jobs (etl-accuracy-check.js, archive-old-inspections.js)
supabase/                 migrations (views and functions only) and functions/submit-feedback
docs/                     ARCHITECTURE.md (mermaid diagrams), SMOKE_TEST.md (manual checklist)
.github/workflows/        ci.yml, ingest.yml, db-backup.yml, archive.yml, etl-check.yml
```

`src/lib/` modules: samePlaceDetection, scoring, categories, dates, dedupe, geocode, bottomSheet, mapBounds, constants.

## Commands (from `InspectionWebsite/`)

```
npm ci
npm run dev
npm run lint        # 0 errors expected; 4 known warnings (see below)
npm test            # vitest run; 113 tests across 10 files after the latest round
npm run build
```
ETL: `cd etl && npm test`. Needs Node 20.19+. Env vars (see `.env.example`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GEOAPIFY_KEY`, `VITE_FEEDBACK_FUNCTION_URL` (optional). CI uses dummy Supabase values.

## Conventions

- New logic goes in `src/lib/` first, with a test next to it (`foo.js` + `foo.test.js`). Frontend tests are colocated; ETL tests live in `etl/tests/`. Keep that split.
- Component CSS goes in `src/styles/<Component>.css`, imported by the component. No CSS inside JS template strings.
- One concern per commit. Conventional-style messages: `fix(drawer): ...`, `refactor: ...`, `chore: ...`.
- Do not reformat files you are not changing. A Prettier pass is planned as its own commit.
- Before committing: lint, test, build, and walk `docs/SMOKE_TEST.md` if the map, drawer, filters, or What's New changed.
- Git hygiene: use `git add -A` then `git status --short` before committing. Never `git commit -am` (it skips new files, which has already bitten this repo once). Always give the user commands to run from the repo root, using paths relative to it.
- Reading from the working tree vs HEAD: use `git show HEAD:path` to see committed content.

## Things that will bite you (learned the hard way)

- **Click-outside handler:** Map.jsx has a document-level capture `outsideClose` that closes the info drawer on any click outside an exempt list (control card, drawer, account panel, table panel, `.wn-panel`, `.wn-trigger`, a few buttons). Any new floating panel or toggle must be added to that list or it will close the drawer.
- **Global CSS leaks into inline-styled elements.** `index.css` has a global `button` rule (padding, background). Inline-styled buttons must set `padding: 0` and sizing explicitly. A selector like `.info-drawer [style]` once forced padding onto every inline-styled element in the drawer and broke the bookmark button; never use broad `[style]` selectors.
- **`!important` beats inline styles.** Check CSS files before debugging layout in JSX.
- **Do not add `applyFilter` / `applyFilterWhenReady` to hook dependency arrays** in Map.jsx. They are recreated each render and would rebuild the map. The 4 remaining lint warnings (2 in Map.jsx, 2 in TableView.jsx: `onResize`, `selCats`) need a real restructure (the Map split), not a dependency tweak.
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
- **Watch areas:** `watchAreaLayer.js` (circles, editor popup with drag handles). Clicking the popup card (not its buttons) opens the Saved panel scrolled to that area (`openWatchPanelRef`, `focusArea`). Default sort in a watch area is critical-first.
- **Pan limits:** `lib/mapBounds.js` widens the old fixed box by an amount that scales with the window, so pins under side panels can be panned into view.
- **Auth:** Supabase email one-time **6-digit code** (not the magic link). `AuthContext.jsx` exposes the single client from `lib/supabase.js`. For local magic links to work, `http://localhost:5173/**` must be in Supabase Redirect URLs; the code flow avoids that.
- **Feedback:** `FeedbackModal.jsx` posts to the `submit-feedback` edge function (IP rate limit, honeypot, cooldown).
- **Date filter and map cache constants:** `lib/constants.js`.

## Decisions already made

- No contributor scaffolding (see above). Keep `docs/ARCHITECTURE.md` and `docs/SMOKE_TEST.md`.
- Header label is "Saved" (alternatives considered: Watch, Account, My Places, Watchlist, Alerts).
- Swipe-to-close on the phone drawer is on; the owner may turn it off.
- Prettier: expect about 35% of lines to change. Recommended: format JS/JSX/JSON only (add `*.css` to `InspectionWebsite/.prettierignore`, because Prettier would explode compact one-line CSS rules).

## State at time of writing (verify with git)

Applied and committed: lint cleanup, same-place extraction, scoring/categories/dates/dedupe/geocode extraction, shared `useMediaQuery`, phone bottom sheet and layering, outside-click fix for What's New, scaled pan limits, Vitest and CI.

Delivered as "round 9" and possibly not yet applied: component CSS moved out of JS strings into `src/styles/`, four hook-warning fixes (lint went 9 -> 4 warnings), unused `CAT_COLORS` removed, `DATE_FILTER_OPTS` and geo-cache constants moved to `lib/constants.js`, a real root `README.md`, a coverage block in `vite.config.js`, and `Map.jsx` importing `./styles/Map.css`. **That last import needs `Map.css`, `Header.css` and `TableView.css` moved into `src/styles/` with `git mv` first** (Map.css `@import`s the other two by relative path, so move all three together).

## To do, in rough order

1. Finish applying round 9 (see above), then run lint, test, build, and the smoke test.
2. `git rm docs/good-first-issues.md`. Delete `src/App.css`, `src/assets/react.svg`, `public/vite.svg` only if `git grep -n "App.css\|react.svg\|vite.svg" InspectionWebsite` shows no real uses.
3. Add a `LICENSE` file (MIT; README already says MIT) and `npm pkg set license=MIT` in `InspectionWebsite/`. Replace the two `<your-github-username>` placeholders in `README.md` (CI badge). Add screenshots at `docs/images/desktop.png` and `mobile.png` (no personal info such as emails in them) and uncomment them in the README.
4. Prettier pass as its own commit; record the commit hash in `.git-blame-ignore-revs`; then add `npm run format:check` to `ci.yml`.
5. Coverage: `npm i -D @vitest/coverage-v8@5.1.0` (must match the installed vitest), add script `"test:coverage": "vitest run --coverage"`. Coverage of `src/lib` was about 99% lines; components are untested, so describe any badge as logic-layer coverage. Codecov is optional.
6. Tests for fixed bugs: pull the What's New outside-click rule into a small testable function; add a few Testing Library component tests (drawer, What's New including the no-pin row). Needs jsdom.
7. Split Map.jsx into hooks, one small PR at a time: useFeatureData, useMapInstance, usePopups, useMapFilters, useDrawer (with a single `openEstablishment`), usePanels. Then an `api/` layer for the ~20 direct Supabase calls.
8. Cleanup candidates: leftover "get placard alerts" and "Unsubscribe anytime" text in `LearnPage.jsx` (the feature does not exist; check with `git grep -n -i "unsubscribe anytime\|placard alerts" InspectionWebsite/src`), and the dead unsubscribe-link handler in `AuthContext.jsx`.
9. Later: consolidate the three backend `package.json` files (root, `etl/`, `scripts/`), consider TypeScript after the split.

## Working with the owner

Prefers concise, warm, punchy communication that does not sound like an AI, and pushes back on anything long-winded or over-promised. Gets confused by paths and git state, so always say where to run a command, show exact commands, and tell him what the output should look like. Explain "why" briefly before changing something non-obvious. Verify claims against the code instead of guessing; several early assumptions in this project turned out to be wrong and were caught only by reading the files.
