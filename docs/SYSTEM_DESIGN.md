# Systems design review (2026-11-10)

Written for the owner, from a review session; kept in the repo so the findings, the bug list (Part 3) and the fix plan (Part 4) survive. Nothing in Part 4 has been implemented yet. The measured numbers carry their dates.

---

## Context

You asked for a systems-design lesson aimed at your own app: what breaks when a county's data
won't load, what happens if Supabase pauses, caching, indexes, monolith vs. services, load
balancing, backups, ACID in the ingest, and how adding counties moves you toward the free-tier
limits. I read the code instead of answering from theory, and measured two things on the live
site. The lesson is Part 1 and 2. Part 3 is the bugs that reading turned up (all verified in the
files, none assumed). Part 4 is the plan: a docs PR for the write-up (`docs/SYSTEM_DESIGN.md`)
and four small fix PRs, one concern each.

Numbers used below (measured 2026-11-10 unless noted):

| Fact                           | Value                                                                                            | Where it came from                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| One fresh visit, Supabase JSON | 2.4 MB decompressed, **387 KB on the wire**                                                      | Playwright + CDP on the live site, `?bust=1` |
| ...of which                    | feed 245 KB (6 pages), facilities 99 KB (7 pages), flags 28 KB (6 pages), Bullitt 16 KB (1 page) | same                                         |
| One fresh visit, Netlify       | 410 KB on the wire (1.4 MB JS uncompressed)                                                      | same; `apps/web/dist`                        |
| Rows                           | facilities 6,001-7,000; places with pins 5,001-6,000; Bullitt ~250                               | page counts above; `docs/BULLITT.md`         |
| Database                       | 63 MB of 500 MB; egress 0.04 of 5 GB; MAU 1 of 50,000                                            | your dashboard screenshots                   |
| Compute                        | Nano: up to 0.5 GB RAM, shared CPU, 60 direct / 200 pooled connections                           | Supabase compute docs                        |
| Pause rule                     | 7 days of low DB activity; warning email a week before; restorable for 1 year                    | Supabase free-project-pausing docs           |
| Schedule rule                  | public-repo scheduled workflows are disabled after 60 days without commits, silently             | GitHub Actions docs                          |

---

## Part 1: the system you actually have

```
Louisville ArcGIS ─┐                                   ┌─ Netlify CDN: static React bundle
Bullitt Google Sheet┴─> GitHub Actions (daily) ─> Supabase Postgres <─ PostgREST <─ browser
Kentucky 911 points ─┘   (service role, REST)      (Nano, single node)   (anon key, REST)
                                                      ▲
                               pg_dump nightly ───────┘  → private backup repo (30 kept)
                               archive monthly: 3-year-old Jefferson rows → R2, then deleted
```

- **Write path:** the pipeline, once a day, service-role key, plain REST upserts. No transactions.
- **Read path:** the browser, anon key, straight to views and RPCs. No server of your own in between.
- **User writes:** watchlist, watch areas, feedback (edge function). Tiny.
- **Caching:** the map payload in `sessionStorage` for 6 hours, cache-first. Nothing else.
- **Monitoring:** a red workflow run; the backup job also emails. Nothing watches the site.

It is a modular monolith with managed edges: one database, one deployable site, one batch job per
county. That is the right shape for this project (Part 2.6).

---

## Part 2: your questions, answered against the code

### 2.1 The five framing questions

1. **How many users, how fast growing.** MAU 1 on the dashboard; API gateway ~3,000 requests a day,
   most of it your own pipeline and today's Playwright runs. Growth is a step function: a news
   mention or a Reddit post, then quiet. Design for the spike, not the trend.
2. **Read or write heavy.** Reads, by a mile. Writes happen once a day in batch, plus a handful of
   watchlist rows. This is why the client-side cache and a static-feed design (2.7) pay off so much.
3. **What can be lost.** Jefferson data: nothing to lose, it's re-ingestable from ArcGIS (the whole
   violations layer is re-pulled every day). **Bullitt history cannot be re-created**: the sheet only
   shows the latest result, your database is the only record of past scores. User accounts and
   watchlists likewise. So backups matter for `bullitt_*`, `watchlist*`, `profiles`, `auth.users`
   and little else. The nightly `pg_dump` has no `--schema` filter, so it should include all of
   these; confirm with `zcat backup-*.sql.gz | grep -c "COPY auth.users"` on a recent file (Part 5).
4. **Latency.** A fresh visit is 19 sequential-ish round trips to Supabase (three reads in
   parallel, each paging 6-7 times), and the Jefferson feed view recomputes a window function over
   every inspection for each page. It's fine today because the whole database fits in RAM. The
   8-second splash ceiling is the only latency budget you've written down.
5. **Cost.** $0 as long as you stay under: 5 GB egress, 500 MB disk, Nano compute, Netlify 100 GB
   bandwidth and 300 build minutes. Section 2.11 ranks which you'd hit first.

### 2.2 One county's data doesn't load

What the code does now (`features/map/useMapFeatures.js`, `api/mapData.js`, `api/bullitt.js`):

| Failure                                     | Today                                                                                                                                                   | What it should do                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Bullitt view fails                          | Jefferson renders, Bullitt pins silently missing, console warning only                                                                                  | Same map, plus a notice: "Couldn't load Bullitt County right now"                       |
| Jefferson feed fails                        | `loadFeatures` returns null, **the map is never created** (blank container after the 8 s splash), a healthy Bullitt load is thrown away, nothing cached | Draw the basemap and whatever loaded; notice names the county                           |
| `facilities` or `get_violation_flags` fails | Pins draw with every category "unknown" and no rings; no message                                                                                        | A notice ("some details unavailable") or at least a retry                               |
| Whole project down / paused                 | Same as the Jefferson row                                                                                                                               | Use the expired cache if there is one ("showing places from 2:15 pm"), otherwise say so |
| Drawer history fails                        | Skeleton disappears, history silently empty                                                                                                             | One line: "Couldn't load history"                                                       |
| What's New fails                            | Developer text: "Run the get_whats_new migration"                                                                                                       | A user-facing line                                                                      |

The design principle: **per-source results, never a single all-or-nothing promise.** Each county
returns `{features, error}`; the map renders the union; a pure function turns the error set plus the
cache state into one sentence. Because `lib/regions.js` already lists the counties, the notice can
be generated per region and a third county gets it for free. This is PR B.

### 2.3 Supabase pausing

Rule: a free project is paused after a 7-day window of low database activity; you get an email a
week before. Your daily ingest, Bullitt ingest and `pg_dump` are plenty of activity. The real
threat is upstream: **GitHub silently disables scheduled workflows in a public repo after 60 days
with no commits.** Chain of events: you take two months off → every schedule stops (no run, so no
red run, so no email) → a week later Supabase pauses → the site shows a blank map after 8 seconds,
What's New shows "run the migration", nobody is told. Also: your e2e screenshots branch and PR
merges are commits, so as long as you're working, you're safe; the danger is exactly the quiet
period when you'd notice last.

Prevention, cheapest first:

1. A step at the end of `ingest.yml` that calls GitHub's enable-workflow endpoint for each
   scheduled workflow (`gh workflow enable`, a no-op while they're on). This is what keep-alive
   tools did; GitHub documents the 60-day rule but not that an enable call resets it, so treat it
   as observed behaviour, not a guarantee. PR C.
2. A dead-man's switch **outside GitHub**: the ingest pings a healthchecks.io URL when it finishes;
   if a day passes with no ping, you get an email, whatever the cause (schedule disabled, Actions
   outage, repo archived). You can't detect absence from inside the thing that's absent. PR C,
   optional secret.
3. A visible "Data updated <date>" per county (PR B), and a "Data last updated" line on the map
   after 3 days, so staleness is noticed by anyone, including you.
4. Upgrading to Pro ($25/month) removes pausing entirely; not worth it yet.

Related: GitHub says `schedule` "can be delayed during periods of high load" and "some queued
jobs may be dropped". A missed day moves Bullitt's `first_seen` (your estimated dates) by a day
and leaves Jefferson a day behind; both self-heal on the next run.

If it does pause: the dashboard's "Resume project" restores it within a year; the site needs
nothing. Paused projects answer the API with errors, which today means the blank map.

### 2.4 Caching

What exists: the map payload in `sessionStorage` (key `lfs_geodata_v6`, 6 h). `lib/constants.js`
says localStorage; the code uses sessionStorage, so the cache dies with the tab and a returning
visitor pays the 387 KB again. Nothing else is cached.

Where caching is possible and where it isn't:

| Layer                   | Worth it?                                                           | Note                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser, map payload    | Yes, already done. Add: use an expired cache when the network fails | Switch to localStorage (PR B): a fallback only pays off across visits, and a returning visitor inside 6 h then costs the database nothing. ~2.4 MB JSON against a ~5 MB quota is best-effort; where it doesn't fit, the existing try/catch gives exactly today's behaviour. Past that size the honest home is IndexedDB, or the static feed (2.7), which makes the question moot via HTTP caching |
| Browser, drawer history | Marginal                                                            | People rarely reopen the same place; skip                                                                                                                                                                                                                                                                                                                                                         |
| CDN                     | Only for static files                                               | Supabase REST responses aren't CDN-cached. The way to get CDN caching is to make the map feed a static file (2.7)                                                                                                                                                                                                                                                                                 |
| Database                | Yes, in a different sense                                           | A materialized view or a `facilities_latest` table that the pipeline fills would stop recomputing the window function on every page of every visit                                                                                                                                                                                                                                                |
| Server                  | n/a                                                                 | You have no server; that's a feature                                                                                                                                                                                                                                                                                                                                                              |

Rule of thumb: cache what is **public, identical for everyone and changes slowly.** Your map feed
is exactly that (changes once a day). Per-user data (watchlist) never is.

### 2.5 Indexes: what, why, and why not guess

An index is a sorted side-structure the planner can use to **skip most of a table** (selective
`WHERE`) or **deliver rows already in the needed order** (`ORDER BY`, `DISTINCT ON`, window
partitions). It costs: write time on every insert/update, disk, and a worse plan if the planner
picks it wrongly. On a table that fits in memory, a sequential scan of 50,000 rows takes a few
milliseconds, which is why nothing hurts today.

Your hot paths and their support (full table in Part 3 notes, from the migrations):

- Drawer: `inspections (establishment_id, inspection_date DESC)` exists; violations by
  establishment exists. Good.
- What's New: `inspections(inspection_date)` exists. Good.
- Table View "Unique": `DISTINCT ON (establishment_id, ins_type_desc) ORDER BY ..., inspection_date
DESC, inspection_id DESC` has **no matching index**, and every page and every count re-sorts all
  inspections. Tempting, but a DISTINCT ON reads the whole table either way; the choice is
  seq scan + sort versus an ordered index walk with random heap fetches, and the planner often
  prefers the sort. **Measure before adding** (PR D ships the EXPLAINs, not the index).
- Table View search: `ilike '%term%'` on `name, address, city, zip`, while the trigram GIN
  indexes are on `name_search` and `addr_search`, so they're never used by the site. Worse, no
  index can help here: the filter is applied _above_ the `DISTINCT ON` subquery in
  `v_table_latest`, and Postgres only pushes a predicate into such a subquery when it's on the
  DISTINCT ON columns. **If search ever feels slow, change the view, not the indexes.**
- Learn page violation summary: filters `inspection_violations(inspection_date)` alone; the only
  index leads with establishment_id, so it can't serve a date range. The one likely add.
- Duplicates: `facilities_establishment_id_uidx` repeats the primary key;
  `inspections_establishment_id_idx` is a prefix of `inspections_est_idx`. Pure cost. Drop.

**Why not guess:** a guessed index that isn't used still gets maintained on every write and can
tempt the planner into a worse plan. Postgres will tell you the truth for free:
`EXPLAIN (ANALYZE, BUFFERS) <query>` shows what it actually did; `pg_stat_user_indexes.idx_scan`
shows which indexes have never been touched since the stats were reset. Measure, add one, measure
again. That is PR D, written so you run the EXPLAINs yourself before and after.

Makes no sense to index: tiny tables (watch areas, 3 per user), columns never in a filter, `raw`
jsonb, anything whose query already hits an index.

### 2.6 Monolith or microservices

What you have is a **modular monolith with managed edges**: one Postgres, one static site, batch
jobs. The only true service boundary is the one you already drew, write path (pipeline, service
role, GitHub) versus read path (site, anon key, browser). That boundary is the correct one; it's
enforced by RLS, not by process.

Microservices would be the wrong choice here and it's worth being able to say why: a solo
developer, one deploy target, no component with a different scaling need, no team boundary to
mirror. Services buy independent deploys, independent scaling and failure isolation at the price
of network calls, duplicated data and operational surface. You'd pay all of the price and collect
none of the benefits. The Supabase edge function (feedback) is a _function_, not a service: it
exists because the rate limiter needs a secret the browser can't hold.

What "should have been taken"? The same. The refactor worth doing is structural, not
architectural: the `packages/core` shared-logic package and a real region abstraction
(`docs/REFACTOR_PLAN.md`, Part 2.10), so counties become data, not forks.

### 2.7 How load balancing works in Supabase (and where your scaling actually comes from)

Supabase on the free plan: Kong API gateway → PostgREST (stateless, Supabase runs it for you) →
Supavisor connection pooler → **one** Postgres on a Nano instance. There is no load balancer in
front of the database; read replicas are a paid add-on. Your browser clients never hold a Postgres
connection (PostgREST does, from its own pool), so 10,000 visitors don't exhaust the 60 direct
connections. Only `pg_dump` connects directly.

Netlify is the load balancer you do have: the bundle is on a CDN, so the site itself scales to
anything. The database is the single point.

The real scaling move, if you ever need it, is to **notice that the map feed is a public,
daily-changing file**: have the pipeline write `jefferson.geojson` and `bullitt.geojson` (or one
file) to the site or R2 after each run. Then a visit costs Supabase nothing until someone opens
a drawer, the egress line moves from Supabase's 5 GB to Netlify's 100 GB, the 19 round trips
become one cacheable GET, and a paused Supabase degrades to "map works, details don't". Don't
build it now; keep it as the known next step and design PR B so a county's loader is replaceable.

### 2.8 Database size, RAM, backups, retention

- **Size:** 63 MB with full Jefferson history and 250 Bullitt places. The `inspections.raw` jsonb
  column stores a copy of every ArcGIS row and is probably the largest thing in the database
  (`select pg_size_pretty(pg_total_relation_size('inspections'))` to see; Part 5). A Jefferson-sized
  county would add tens of MB; a Bullitt-sized one, under 1 MB. Ten more counties fit.
- **RAM:** Nano gives up to 0.5 GB; the whole database fits, so every query is in-memory. That
  is also why the missing indexes don't show. It stops being true somewhere past ~300 MB.
- **Backups:** nightly `pg_dump` of everything readable to the backup repo, 30 kept (older ones
  stay in that repo's git history), failure emails you. Includes `bullitt_*` by construction.
  Two gaps: the dump itself is probably your **largest egress consumer** (a 20-30 MB transfer a
  day ≈ 0.6-0.9 GB a month; the usage page breaks egress down by service, so check), and there's
  no restore drill. Do one restore into a scratch project once; a backup you've never restored
  is a hope.
- **Retention:** Jefferson rows older than 3 years go to R2 monthly (places with 10+ inspections
  only), then are deleted. Bullitt has no archive and needs none at ~2 rows per place per
  change. Keep Bullitt forever: it's the irreplaceable set. The archive job has a destructive bug
  (Part 3).
- **How long to keep:** source keeps "about 2016 onward" for Jefferson, so your archive is
  already the only copy of the oldest rows you've deleted. Keep R2 objects indefinitely; they're
  cents.

### 2.9 ACID and the ingest

ACID is a property of a transaction. **Your ingest has no transactions**: every PostgREST call is
its own transaction, so each batch of 500-2,000 rows is atomic and nothing larger is. What that
means in practice:

- A run that dies mid-step leaves the database **consistent but incomplete** (some pages written,
  some not). Every write is an upsert on a natural key, so the next run repairs it. Idempotence
  is doing the job atomicity would.
- The exceptions are where a run **records that it finished before it did**, or **deletes before
  it has proof of the copy**. Bullitt saves the sheet's hash before writing the rows, so a crash
  after that makes every later run say "sheet unchanged". The archive deletes rows even when
  copying their violations failed, and its violations read is silently cut at 1,000 rows, so the
  copy in R2 can be incomplete _without any error at all_ (Part 3). Ordering bugs: do the
  irreversible thing last, and only after checking what you're about to make irreversible.
- Readers can see a half-updated state for the minutes a run takes (new inspection, old
  violations). For a once-a-day job at 3:30 am local, nobody will.

If a county's load ever needed to be truly atomic (all rows or none), the tool is one RPC with
the writes inside a plpgsql function, or a staging table swapped in with one `ALTER TABLE
RENAME`. Not needed yet.

### 2.10 Many counties: the expansion-pack shape

What adding a third county costs today (all touch points verified):

- new tables (Bullitt has its own) and its own feed view;
- edits to **five** shared SQL objects that `UNION ALL` the counties by hand
  (`v_table_inspections`, `v_table_latest`, `v_watchlist_with_latest`, `get_whats_new`,
  `watch_zone_places`) plus the watchlist triggers;
- a pipeline folder, a workflow, an `api/<county>.js`, a `lib/<county>.js`, a `REGIONS` entry,
  an outline geojson, fixtures;
- five places that test `region === "bullitt"` by name.

That's a fork, not an expansion pack. The shape to move toward, in order of payoff:

1. **Status per county, visible**: every ingest writes an `import_runs` row; a `v_ingest_status`
   view; the Learn page and the failure notice read it. (PR B.) This is the "make it clear which
   are working every day" you asked for.
2. **One schema for all counties**: a `region` column on `facilities`/`inspections` instead of
   `bullitt_*` tables; the five unions collapse into plain queries. A real migration with data
   copy; do it before county three, not after.
3. **A region registry in the pipeline** mirroring `lib/regions.js`: source type (arcgis, sheet,
   pdf), parser, geocoding defaults, outline. The workflow becomes a matrix over regions.

Data availability decides the list more than code does. Quick look: Floyd County, IN posts one
PDF per inspection (state form 57480), parseable but a different class of pipeline; Clark County,
IN shows nothing online; Oldham, Shelby, Spencer and Hardin (Lincoln Trail district) turned up
nothing machine-readable in a first search and need a direct look at each department's site.
Tiering: ArcGIS/CSV = days, PDFs = weeks and fragile, nothing = an open-records request.

### 2.11 Free-tier risk, in the order you'd hit it

1. **Operational, not quota:** the 60-day schedule shutoff → pause chain (2.3). Fix: PR C.
2. **Egress (5 GB):** probably the nightly dump first (check the per-service breakdown), then
   visits at ~387 KB each ≈ 13,000 fresh visits a month. A news day could do that. The lever is
   2.7 (static feed), which moves it to Netlify's 100 GB.
3. **Disk (500 MB):** 63 MB now; `inspections.raw` is the knob if it ever matters.
4. **Netlify:** 100 GB ≈ 250,000 visits; 300 build minutes ≈ 150 deploys/previews a month. Fine.
5. **Never, at this shape:** 50,000 MAU, edge function invocations, GitHub Actions minutes (free
   for public repos), Nominatim's 1 req/s policy (you sleep 1.1 s).

Each new Jefferson-sized county adds roughly: +250 KB per visit (so the visit budget halves),
+30 MB disk, +25% dump egress, one more daily job. Each Bullitt-sized county adds nothing you'd
measure.

### 2.12 Features you listed

- **Weekly digest emails.** `profiles` already has `alert_email`/`alert_frequency` and the dead
  `unsubscribe_by_token` handler, so this was planned once. Needs: a sender (Resend's free tier,
  100/day), a weekly workflow that diffs each user's watchlist/areas against `import_runs`-stamped
  changes, an unsubscribe token table. Two or three days. Do it after the status work in PR B,
  because "what changed since last week" is the same question.
- **Spanish.** ~300 UI strings; `react-intl` or `i18next`; the data stays English (violation text
  is the inspector's). Half a week, mostly the drawer and Learn page.
- **Accessibility.** Add `@axe-core/playwright` to the e2e suite, keyboard access to the drawer
  and popups, visible focus, and a non-color cue for score bands (the ring already helps). The
  map canvas itself can't be made fully accessible; the Table View is your accessible path, say so.
- **Across the river / more counties.** 2.10.

---

## Part 3: bugs found while reading (all verified in the files)

Ranked by harm. #1 and #2 are the ones to fix first.

| #   | Where                                                                                                                                                             | What                                                                                                                                                                                                                                                                 | Effect                                                                                                                                                                                                                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `archive-old-inspections.js:172-175` (and 111-116, 133-137)                                                                                                       | Batched `.in()` reads of 500 inspection ids' violations have no paging; Supabase cuts any response at 1,000 rows, with no error                                                                                                                                      | **The archive in R2 can be missing violations, and the rows are then deleted.** Data loss by construction, silent. Check what the past runs uploaded (Part 5)                                                                                                     |
| 2   | `archive-old-inspections.js:176-179, 221-243`                                                                                                                     | A failed violations fetch is counted, then the job uploads and deletes anyway                                                                                                                                                                                        | Same loss, the noisy variant                                                                                                                                                                                                                                      |
| 3   | `archive-old-inspections.js:82`, `seed_facilities.js:19`, `seed_inspections.js:62`, `geocode_missing.js:69`, `coverage_check.js:223,268`, `bullitt/ingest.js:310` | Whole-table selects without paging, same 1,000-row cap                                                                                                                                                                                                               | The archive only ever considers 1,000 inspection rows; `seed_facilities` re-upserts ~5,000 "new" places daily and `seed_inspections` re-stubs them (misleading logs); `geocode_missing` re-geocodes cache hits past 1,000 cache rows; coverage report says "1000" |
| 4   | `pipeline/regions/bullitt/ingest.js:221`                                                                                                                          | Snapshot (CSV hash) is saved before the rows are written                                                                                                                                                                                                             | A crash after that line freezes Bullitt until the sheet changes again                                                                                                                                                                                             |
| 5   | `pipeline/overlay_geometry.js:31-32, 47, 49-54`, `DataSourceLinks_Quicklist.txt:5-6`                                                                              | Requests `returnGeometry`, expects `_lon/_lat` that nothing attaches. Checked: the ArcGIS layer is `"type": "Table"`, it has no geometry at all, so this never could have worked. Meanwhile the same upsert resets `loc_source` to `legacy` on every place every day | Dead code and a wrong doc line (coordinates come only from `geocode_missing.js`, which is fine). The daily `loc_source` reset makes `coverage_check`'s source breakdown wrong                                                                                     |
| 6   | `pipeline/Recover.js:50-54` (capital R in git), `lib/import_runs.js:failRun`                                                                                      | Errored runs are replayed daily for 30 days even after recovery; `failRun` overwrites the window in `notes`                                                                                                                                                          | Wasted re-pulls; replay falls back to a 1-day window                                                                                                                                                                                                              |
| 7   | `lib/constants.js:22` vs `useMapFeatures.js:21`                                                                                                                   | Comment says localStorage, code uses sessionStorage                                                                                                                                                                                                                  | Documentation only (PR B changes the code to match the comment)                                                                                                                                                                                                   |
| 8   | `WhatsNew.jsx:164-168, 265`                                                                                                                                       | Any error shows "Run the get_whats_new migration"                                                                                                                                                                                                                    | Developer text shown to users on a network error                                                                                                                                                                                                                  |

Two traps for anyone who later finds a real coordinate source: `facilities.lon/lat` are
generated from `geom` (write `geom` only), and postgrest-js sends the union of keys across a
batch, inserting NULL for rows missing a key, so a mixed batch would wipe `geom` on the rows
without one.

---

## Part 4: implementation plan

Five PRs against `main`, in this order (B rebases on A). Each follows CLAUDE.md: one concern per
commit, Prettier on touched files, `npm run lint`, `npm test`, `npm run build`, and `npm run e2e`
when the map changes. The owner reviews and merges; nothing is pushed to `main` directly.

Two facts that shape the pipeline work: `pipeline/lib/db.js` creates the Supabase client at
import time (so tests can't import anything that imports it; `tests/import_runs.test.js` inlines
copies for that reason), and git tracks `pipeline/Recover.js` with a capital R (Windows shows
`recover.js`; a Linux session must use the capital).

### PR A: `fix/pipeline-correctness` (5 commits)

1. **`fix(archive): page every read, and stop before deleting if any read failed`**
   - New `pipeline/lib/paging.js`, pure, client passed in, mirroring `apps/web/src/api/mapData.js`
     `readAllPages`: `readAllPages(page, pageSize = 1000)` where `page(from, to)` returns a query;
     stops at the first short page; throws on error. Plus `selectAll(supa, table, columns,
{ order })`. Always order by a unique column (a `.range()` read with no stable order can
     skip or repeat rows between pages).
   - `pipeline/archive-old-inspections.js`: candidates (82-86) via `selectAll` ordered by
     `establishment_id`; the three batched `.in()` reads (111-116, 133-137, 172-175) via
     `readAllPages` ordered by `inspection_id`; delete the unused local `fetchAll` (59-72);
     remove the `stats.errors++; continue` branches on reads (118-122, 139-143, 176-179) so a
     failed read throws, and add `if (stats.errors) throw` before Step 4 (upload) as a belt.
   - Test `pipeline/tests/paging.test.js`: stub `page(from, to)` slicing an array: 2,500 rows →
     3 calls in order; exactly 1,000 → 2 calls; 0 → `[]`; `{ error }` → rejects; `selectAll`
     with a chainable stub asserting the order column and ranges `[0,999]`, `[1000,1999]`.
   - No unit test for the archive script itself (runs at import, `process.exit`); say so.
2. **`fix(pipeline): page the other full-table reads`**: `seed_facilities.js:19-21`,
   `seed_inspections.js:62` (`selectAll`, order `establishment_id`), `geocode_missing.js:69-71`
   (order `key`), `coverage_check.js:223-226, 268-271` (keep the `.not("lon","is",null)` filter),
   `regions/bullitt/ingest.js:310-315` and its two hand-rolled loops (228-237, 276-286) →
   `readAllPages`. Leave alone: `Recover.js` (30-day window), `etl-accuracy-check.js`
   (`.limit(200)`), `seed_categories.js`, `backfill_types.js` (already paged).
3. **`fix(bullitt): save the snapshot after the load, not before`**: extract `load()` with
   `must`, `chunks`, `CHUNK`, `MIN_SHARE_OF_LAST` into `pipeline/regions/bullitt/load.js`
   (same move `versions.js` got in `015f82b`), signature `load(supa, csv, establishments,
{ day })`, returning `{ read, upserted }`; keep the sha compare and the 50% check at the top,
   move the `bullitt_snapshots` insert after the inspections writes. Test
   `pipeline/tests/bullitt_load.test.js` with a ~40-line recording stub: unchanged sha → zero
   writes; changed sha → the snapshot insert is the **last** write; a sheet under half the last
   `row_count` throws before any write. `docs/BULLITT.md` line 60 stays true.
4. **`fix(pipeline): overlay never had coordinates to write`**: `overlay_geometry.js` drop
   lines 31-32 and 49-54, drop `loc_source: "legacy"` from the row (47), fix the header comment;
   `seed_facilities.js:54` comment; `DataSourceLinks_Quicklist.txt:4-9` say the layer is a table
   with no geometry and coordinates come only from `geocode_missing.js`. `lib/arcgis.js`
   unchanged.
5. **`fix(pipeline): a recovered run is not replayed; failRun keeps the window`**:
   `lib/import_runs.js` gets a lazy client (`_setClient`/`_resetClient`, like `arcgis.js`'s
   `_setFetch`), `failRun` reads `notes` then merges `{ ...existing, error }` (as `markRecovered`
   in `Recover.js:59-73` does), new pure `needsRecovery(run)` (recovered_at → false;
   !finished_at → true; notes.error → true; else false); `Recover.js:48-56` → `.filter(needsRecovery)`.
   `tests/import_runs.test.js` imports the real functions (delete the inlined copies, 53-89),
   `SupaStub.single()` returns the row matching the filter; add `failRun` keeps
   `window_start/window_end`, and `needsRecovery` four cases.

Owner after merge: nothing in Supabase. Run `archive.yml` once by hand and read its summary.

### PR B: `feat/data-notice` (rebased on A)

1. **`feat(db): v_ingest_status`**: `supabase/migrations/20261114000000_ingest_status.sql`:
   `DISTINCT ON (source)` latest row of `import_runs` with `finished_at IS NOT NULL AND
(notes->>'error') IS NULL`, columns `source, run_id, started_at, finished_at, rows_read,
rows_upserted` (no `notes`), `security_invoker`, `GRANT SELECT TO anon, authenticated`.
   `import_runs` is already anon-readable (baseline policy, line ~1138).
2. **`feat(bullitt): record each load in import_runs`**: `regions/bullitt/ingest.js` `run()`:
   after the dry-run return, `startRun("bullitt", day, day)`, try/catch around
   load → overrides → geocode, `finishRun(runId, read, upserted)` / `failRun` and rethrow. Static
   import is fine once A5's lazy client exists. One sentence in `docs/BULLITT.md`.
3. **`feat(map): each county loads on its own; the map draws whatever loaded`**:
   - `lib/regions.js`: `ingestSource: "seed_inspections"` / `"bullitt"` on each REGIONS entry,
     listed in the header's "To cover another county"; `regions.test.js` checks every region has
     one and they're unique.
   - New `api/ingestStatus.js` → `Map source → row` from `v_ingest_status`, empty Map on error.
   - `api/mapData.js` `fetchMapFeed` and `api/bullitt.js` `fetchBullittFeed`: let errors
     propagate (remove the try/catch); `fetchFacilityMeta`/`fetchViolationFlags` keep degrading
     silently but log with `console.warn` (the e2e load test fails on `console.error`).
   - `features/map/useMapFeatures.js`: `LOADERS` keyed by region id (jefferson = the three
     reads + `buildMapFeatures`; bullitt = `buildBullittFeatures`), run with
     `Promise.allSettled`; `features = combineRegions(...fulfilled)`; cache written only when
     every county loaded; when none did, `readCache({ allowExpired: true })` is the fallback;
     **always** `setGeoData` (even empty) so `useMapLibre.js:53` builds the map and the splash
     dismisses; also fetch `fetchIngestStatus()`; return `status: { results, fallbackTs, ingest }`.
     Storage: `sessionStorage` → `localStorage`; fix the comment in `lib/constants.js:22`.
   - `features/map/useMapLibre.js`: add `.data-notice` to `KEEP_DRAWER_OPEN` (line 20) and
     `NO_EDGE_PAN` (line 25).
4. **`feat(lib): loadStatus`**: `lib/loadStatus.js` + test, pure (`formatDateSafe` from
   `lib/dates.js`): `loadNotice({ regions, results, fallbackTs })` → null | `{ kind: "partial" |
"fallback" | "none", text }` ("Couldn't load Bullitt County's places right now" / "Couldn't
   load inspection data; showing places from <date, time>" / "Couldn't load inspection data");
   `updatedLines(regions, ingest)` → `[{ id, name, finishedAt | null }]`;
   `staleNotice(regions, ingest, now, STALE_AFTER_DAYS = 3)` → "Data last updated <date>" | null.
5. **`feat(map): a dismissible data notice; "Data updated" on the Learn page`**:
   `src/DataNotice.jsx` + `styles/DataNotice.css` (`role="status"`, `data-testid="data-notice"`,
   class `data-notice`, Dismiss button with explicit `padding: 0` because of the global button
   rule; fixed, centred, `bottom: 96px` clear of `.table-toggle-btn`, `z-index: 1200`, the
   `.control-card` look). `Map.jsx`: `notice = loadNotice(...) ?? staleNotice(...)`, dismissed
   state, rendered in the `page === "map" && !accountFullscreen` block; pass `ingestStatus` to
   `LearnPage` (line 254) → `DataSources.jsx` shows `Data updated <date>` per county
   (`data-testid="data-updated"`, "unknown" when null); `styles/LearnPage.css`
   `.ln-sources-updated` after `.ln-sources-note` (788). `docs/SMOKE_TEST.md` step 12.
6. **`test(e2e): county outage and nothing-loads`**: `e2e/support/fixtures.js` adds
   `v_ingest_status` rows for both sources (without it the load test fails on `unmocked`, by
   design); `mockSupabase(page, { fail = [] })` fulfils listed paths with status 500 and a
   PostgREST-shaped JSON error, not counted as unmocked; `app.js` `openApp(page, { mock })`.
   Tests: load test asserts no notice; "Bullitt County down" (fail `v_bullitt_map_feed`:
   attribution visible, notice contains "Bullitt County", no console errors, Dismiss hides it,
   screenshot); "nothing loads" (fail both feeds: basemap attribution present, notice "Couldn't
   load inspection data"); Learn page shows two "Data updated" lines.

Owner after merge: run `20261114000000_ingest_status.sql` in the SQL editor. Until then the Learn
page says "Data updated: unknown" and there is no staleness line; nothing else changes.

### PR C: `chore/keep-alive`

`.github/workflows/ingest.yml` (it has no `permissions:` today): add `permissions: { contents:
read, actions: write }` (naming the block sets every unlisted scope to none, so `contents: read`
must be there for checkout). Two final steps, both `if: always()`:

- "Keep the scheduled workflows enabled": `gh workflow enable "$wf" -R "$GITHUB_REPOSITORY"`
  for `ingest.yml bullitt-ingest.yml db-backup.yml archive.yml etl-check.yml`, `GH_TOKEN:
${{ github.token }}` (`gh` is preinstalled; it calls `PUT .../actions/workflows/{id}/enable`).
- "Ping the dead-man's switch": `curl -fsS -m 10 --retry 3 "$HEALTHCHECKS_URL"` only when
  `secrets.HEALTHCHECKS_URL` is set (`if: ${{ env.HEALTHCHECKS_URL != '' }}` via an env mapping).
  Only on success (`if: success()` for this one), so a failing ingest also trips it.
  Doc: a "Keeping the lights on" checklist in `docs/SYSTEM_DESIGN.md` (where the disabled-schedule
  banner appears, that it sends no email, that the Learn page date is the signal).

Owner: optional, create a free check at healthchecks.io (period 1 day, grace 6 h) and add its ping
URL as the repo secret `HEALTHCHECKS_URL`; run `ingest.yml` by hand once and see "✓ Enabled" ×5.

### PR D: `chore/db-indexes`

`supabase/migrations/20261115000000_indexes.sql`, safe to run twice:

- `DROP INDEX IF EXISTS public.inspections_establishment_id_idx;` (prefix of
  `inspections_est_idx`, certain).
- `facilities_establishment_id_uidx`: a plain unique index (baseline 941), but two FKs reference
  `facilities(establishment_id)` and Postgres binds an FK to whichever matching unique index it
  found first, so drop inside a `DO` block that checks `pg_constraint.conindid` and raises a
  NOTICE naming the constraint instead of failing.
- `CREATE INDEX IF NOT EXISTS inspection_violations_inspection_date_idx ON
public.inspection_violations (inspection_date);` (serves `get_violation_summary`,
  `get_establishments_for_violation` and the Learn page fallback, all date-range filters).
- Not added: the `v_table_latest` composite (measure first), any trigram index for the Table
  View search (can't be used, 2.5), dropping `facilities_name_gin`/`facilities_addr_gin` (no
  reader today; confirm with `pg_stat_user_indexes` over a few weeks).
- A trailing comment block with the `EXPLAIN (ANALYZE, BUFFERS)` statements for `v_table_latest`
  (page, count, search) and the violation summary's body (the RPC is SECURITY DEFINER, so explain
  its SQL, not the call), plus the `pg_stat_user_indexes` query, with the rule: `idx_scan = 0`
  after weeks of traffic means unused; never drop `*_pkey`/`*_key` on that basis.

Owner: run the EXPLAINs before, run the migration outside 06:00-09:30 UTC (the daily jobs; brief
locks), run them after, paste the second timings into the PR.

### PR E: `docs/system-design`

- `docs/SYSTEM_DESIGN.md`: Parts 1-3 of this file, rewritten for the repo (third person, no
  "you", the measured numbers with their dates, the risk ranking, the index policy, the
  "Keeping the lights on" checklist, the static-feed design as the known next step, and the
  expansion-pack roadmap for counties). Audience: readers of the repo, including the owner in a
  year.
- `CLAUDE.md`: a pointer after the REFACTOR_PLAN sentence (line 13); `SYSTEM_DESIGN.md` in the
  `docs/` layout line and the "keep these docs" decision; `bullitt-ingest.yml` in the workflows
  line (missing today); three "things that will bite you" bullets: no ArcGIS layer has geometry,
  PostgREST reads cap at 1,000 rows (use `pipeline/lib/paging.js`), git tracks
  `pipeline/Recover.js` with a capital R; a "Key behaviors" line for the data notice
  (`lib/loadStatus.js`, `v_ingest_status`, `REGIONS[].ingestSource`).
- `README.md` and `docs/ARCHITECTURE.md`: a "See also" line each.

---

## Part 5: verification

Per PR, before pushing: `npm run lint` (0 errors, the known TableView warning), `npm test`
(website + pipeline), `npm run build`, and for B `npm run e2e` with a look at the new screenshots
(`apps/web/e2e/screenshots/`). Then the PR's own CI and e2e checks, reported back here.

Checks only the owner can do, with what the output should look like:

1. **Archive integrity (do this first, before PR A merges).** In R2, list `lfs-archive`; for the
   newest `archive-*.json.gz`, compare `violation_count` in its metadata with how many of its
   `inspection_count` inspections should have had violations. Then in the SQL editor:
   `select count(*) from inspection_violations v left join inspections i using (inspection_id)
where i.inspection_id is null;` — orphans mean violations whose inspections were archived
   but which weren't deleted (the delete batches by the same ids, so this should be 0). If the
   archive's `violation_count` is suspiciously round (1,000) the truncation bit; the rows are
   gone from Supabase but the source layer (`seed_violations.js` re-pulls the whole violations
   layer daily) still has them, so a one-off `seed_violations` run with the archived inspection
   ids restores them. I'll write that script if needed.
2. **Backups cover what matters.** On a recent `backup-*.sql.gz`:
   `zcat backup-2026-11-09.sql.gz | grep -c "^COPY public.bullitt_"` → 3;
   `... | grep -c "^COPY auth.users"` → 1 (if 0, the dump role can't read `auth`, and accounts
   aren't backed up; fix is `--schema=public --schema=auth` plus a role grant, a separate PR).
3. **Egress breakdown.** Supabase dashboard → Usage → Egress by service. If "Database" (direct
   connections) is the biggest line, it's the nightly dump; options are a `--schema=public`
   dump of only the tables that can't be rebuilt, or every other night.
4. **Table sizes.** `select relname, pg_size_pretty(pg_total_relation_size(oid)) from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r' order by
pg_total_relation_size(oid) desc limit 10;` — expect `inspections` first because of `raw`.
5. **PR D before/after.** The EXPLAIN block in the migration; paste the "after" into the PR.
6. **PR C.** Run `ingest.yml` by hand; the keep-alive step prints five `✓ Enabled` lines; the
   healthchecks dashboard shows a ping (if the secret is set).
7. **PR B on the preview.** Load the deploy preview; no notice. Learn page shows "Data updated"
   per county (after the migration has run and the next ingest has finished). Then block
   `*.supabase.co` in DevTools (Network → request blocking), reload: basemap draws, the notice
   says "showing places from <time>" if you'd visited within 6 hours, else "Couldn't load
   inspection data".

What I can't verify from here: anything against the real database or R2 (items 1-5), and whether
GitHub's enable call really resets the 60-day clock (hence the dead-man's switch).
