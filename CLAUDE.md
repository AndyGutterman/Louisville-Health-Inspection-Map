# Louisville Food Safe

A map of health inspection scores for restaurants and food service places in Louisville, KY (Jefferson County) and Bullitt County. Live at https://louisvillefoodsafe.netlify.app. Solo and open source, and the owner's flagship résumé project: code quality, tests, CI and docs matter as much as features.

Sources (Louisville Metro's ArcGIS, Bullitt's own sheet) → `pipeline/` (GitHub Actions) → Supabase (Postgres, Auth, two Edge Functions) → React site on Netlify. The README's "How it works" draws it.

React 19 · Vite 7 · MapLibre GL 5 · supabase-js · Geoapify · Vitest · Playwright · ESLint · Prettier · Node 22 (`.nvmrc`).

**What's merged, open and next is in `docs/STATUS.md`.** Read it first, and check it against `git log`.

## The laws

Break one and something real goes wrong. The last column says what stops you. "Only you" means nothing does yet: when one of those gets broken, `/ship`'s learn step should move it left.

| Law                                                                                                                                                                              | Why                                                                                                                        | Enforced by                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Never touch the live Supabase project: no SQL, `psql`, pipeline scripts, or Supabase MCP data tools. Tests use the fixtures; the owner runs the rest.                            | The free tier allows 5 GB of egress a month. An agent's loop once used it in a day, and November 2026 went over (5.41 GB). | `guard.mjs` hook                                     |
| No browser read that pages through a whole table, and no fallback that does. Name the columns.                                                                                   | The same 5 GB. A fresh map load is already the biggest cost.                                                               | `no-select-star-in-browser` rule, reviewer           |
| Supabase is queried only from `apps/web/src/api/`.                                                                                                                               | One place to see every read.                                                                                               | `supabase-only-in-api` rule                          |
| No "critical" labels, chips, red rings or critical-first sorting. Nothing is decided from `critical_yn`.                                                                         | The flag can't tell the Food Code's three kinds of violation apart (owner's call, 2026-11-09, for accuracy and liability). | Only you, and the reviewer                           |
| Score cut-offs live only in `packages/core/grading.js` (`scoreBand`, `isFailing`).                                                                                               | One badge scale everywhere.                                                                                                | `score-scale-in-one-place` rule                      |
| Every line on the privacy page stays true. Something new stored about a person, a new service or analytics changes the page, the date in `lib/privacy.js` and `docs/PRIVACY.md`. | The page is a promise to visitors.                                                                                         | `storage-keys-documented` rule (partly), reviewer    |
| Never print an email address in `pipeline/digest/`, or a `.env` anywhere.                                                                                                        | The outbox workflow's log is public.                                                                                       | `no-addresses-in-digest-logs` rule, `guard.mjs` hook |
| Kentucky's portal stays off: no portal county, ingest run or read until the owner says permission is in hand.                                                                    | CDP's terms forbid copying and public display.                                                                             | Only you                                             |
| Don't push to `main` or merge your own pull request. A database change is a new migration in `supabase/migrations/` that the owner runs; nothing assumes it has run.             | Merging deploys production.                                                                                                | Only you                                             |
| No CONTRIBUTING file, issue or PR templates, or Dependabot.                                                                                                                      | No outside contributors are expected.                                                                                      | Only you                                             |

## Commands (from the repo root)

```bash
npm ci
npm run dev
npm run lint           # 0 errors and 0 warnings
npm run check:rules    # the repo's own rules (checks/rules.mjs)
npm test               # website (vitest), packages/core, pipeline, checks and the guard (node --test)
npm run test:coverage  # website logic-layer coverage (src/lib), about 98% of lines
npm run build
npm run format         # Prettier; CI runs format:check. Only ever from the root.
npm run e2e -- --trace off   # Playwright, desktop + phone (builds the site, about 30s)
```

One workspace: `npm run <script> -w apps/web` (or `-w packages/core`, `-w pipeline`). The website's env vars are in `apps/web/.env.example`; CI and e2e use placeholder Supabase values.

## Where things are

```
apps/web/src/
  api/          every Supabase query, one file per topic
  lib/          pure logic, no React, no map; each file has a test beside it
  features/     map, drawer, filters, table, saved, learn, admin, privacy
  Map.jsx       the app shell: which panels are open, and the layout
  styles/       one stylesheet per component
packages/core/  shared by the site and the pipeline: categories, grading, regions, email/
pipeline/       data loads and the weekly email (tests in pipeline/tests)
supabase/       migrations/ and functions/
checks/         the rule checks
docs/           STATUS, ARCHITECTURE, SMOKE_TEST, REFACTOR_PLAN, ACCESSIBILITY, BULLITT, COUNTIES, DIGEST, EMAIL_ADMIN, PRIVACY
```

## Context that loads itself

The detail for each part of the code is in `.claude/rules/`. Each file loads by itself when you open a file it covers, so you get it exactly when it matters. If you're about to change an area without having opened its files, read its rules file first.

| Area                                                          | Rules file                  |
| ------------------------------------------------------------- | --------------------------- |
| Map, pins, filters, search, counties and categories on demand | `.claude/rules/map.md`      |
| Info drawer, Saved, watch areas, What's New, phone layering   | `.claude/rules/panels.md`   |
| CSS, contrast, popups                                         | `.claude/rules/css.md`      |
| Table View                                                    | `.claude/rules/table.md`    |
| Weekly digest, email admin, edge functions                    | `.claude/rules/email.md`    |
| Sign-in, feedback, privacy page                               | `.claude/rules/account.md`  |
| Counties, Bullitt, the paused portal                          | `.claude/rules/counties.md` |
| Database reads, migrations, egress, the pipeline              | `.claude/rules/data.md`     |
| Unit, component and e2e tests                                 | `.claude/rules/tests.md`    |
| English and Spanish                                           | `.claude/rules/i18n.md`     |

Two checks keep this honest: `rules-match-files` fails when a rules file's `paths` stop matching anything (after a rename), and `claude-md-stays-short` fails when this file grows past its budget. New detail goes in a rules file, not here.

## Conventions

- New logic goes in `apps/web/src/lib/` first, with its test beside it. Component CSS goes in `src/styles/<Component>.css`.
- Accessibility is WCAG 2.2 AA (`docs/ACCESSIBILITY.md`). Icon-only buttons need `aria-label`; no buttons inside a `role="button"`; a new view gets a line in `e2e/a11y.spec.js`.
- One concern per commit, conventional subjects: `fix(drawer): ...`, `feat(map): ...`, `chore: ...`.
- `git add -A`, then `git status --short`, then commit. Never `git commit -am`: it skips new files, and that has bitten this repo.
- Before committing: lint, `check:rules`, test, build. If the map, drawer, filters or What's New changed, also e2e, the screenshots, and the steps in `docs/SMOKE_TEST.md` e2e doesn't cover.
- `git show HEAD:path` for committed content. The sandbox shell is `sh`: no brace expansion, no `<( )`.

## The phone loop

The owner asks for changes from the Claude app on a phone (a cloud session, PC off), and reviews and merges pull requests in the GitHub app.

- **Use `/ship <request>`** (`.claude/commands/ship.md`): plan → build → review → verify → learn → pull request → checks. Start the request with "go" to skip waiting for the plan.
- Locally, branch from an up-to-date `main` as `fix/...`, `feat/...`, `refactor/...`, `chore/...`, `docs/...` or `test/...`; a cloud session uses the branch it was given.
- Open the pull request with the GitHub tools. `gh pr ...` is blocked in the cloud (GraphQL), but REST works: `gh api repos/AndyGutterman/Louisville-Health-Inspection-Map/pulls -f title=... -f head=<branch> -f base=main -f body=...`. Locally, `gh pr create`, or push and give the owner `https://github.com/AndyGutterman/Louisville-Health-Inspection-Map/compare/main...<branch>?expand=1`.
- The pull request says what changed and why, what was verified (commands and results), what wasn't, and what the owner must do (SQL, settings, secrets).
- `ci.yml` runs lint, rules, tests and the build. `e2e.yml` runs Playwright against the Netlify preview and keeps one comment with every screenshot. In a cloud session, subscribe to the pull request's activity instead of polling.
- **Cloud sessions:** `.claude/hooks/cloud-setup.mjs` runs `npm ci` when the lockfile changed and checks the basemap (`*.cartocdn.com`, needed by e2e; if it's unreachable, tell the owner). Playwright uses the preinstalled Chrome. There is no `.env` and no database password.

## The team

- `planner` and `reviewer` run on Opus at high effort; `verifier` and `keeper` on Sonnet (`.claude/agents/`). The session's own model does the building: Opus for anything bigger than a copy change.
- The reviewer gets the diff, not your reasoning. It has a "Judgment checks" list that grows when a mistake can't be caught by a pattern.
- `checks/rules.mjs`: each rule's `why` says which mistake it came from. Excuse a line with `check-allow: <rule-id> <reason>` on it or the line above.
- Hooks: `guard.mjs` blocks the live database and secrets (quoted text and heredocs are data; tests in `guard.test.mjs`), and `format.mjs` runs Prettier on every repo file you edit.
- `keeper` runs weekly as a scheduled task: drift, repeated mistakes, rule candidates. At most three issues, no code.

## Working with the owner

Concise, warm, punchy, not like an AI; pushes back on anything long-winded or over-promised. Gets confused by paths and git state, so always say where to run a command, show exact commands, and tell him what the output should look like. Explain "why" briefly before changing something non-obvious. Verify claims against the code instead of guessing: several early assumptions in this project were wrong and were caught only by reading the files.

| Not this                                                                        | This                                                          |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| "I've successfully implemented a comprehensive solution for county loading! 🎉" | "Counties now load when you switch them on. One read each."   |
| "You may want to consider possibly running the migration."                      | "Run `20261129000000_digest_language.sql` in the SQL editor." |
| "All tests should pass."                                                        | "`npm test`: 454 passed. I didn't run e2e: no UI changed."    |
