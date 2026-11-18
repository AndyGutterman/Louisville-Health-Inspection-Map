# Refactor plan

Goal: code that one person can read and change with confidence, that new contributors can find their way around, and that can take a second county (e.g. Bullitt) without a rewrite. The site must behave the same after every phase.

## Principles

- **Three parts, clean boundaries:** website (`apps/web`), data pipeline (`pipeline`), database (`supabase`). No microservices: one maintainer gains nothing from more deploys.
- **One home for every rule.** Score colours, categories and Louisville-specific facts each live in exactly one place, in `packages/core`, used by both the website and the pipeline.
- **Regions.** Everything county-specific (map area, address-search box, default city, data sources, category codes, grading rules, Learn page placard text) lives in a region config plus a data adapter. Adding a county means adding one of each.
- **Size limits:** files under about 300 lines, components under about 200. Every Supabase query lives in `apps/web/src/api/`. Pure logic lives in tested modules.
- **Behaviour-identical PRs.** Bugs found along the way are fixed in their own small commits after the refactor step, so each change is easy to review and revert.

## Target layout

```
packages/core/            shared rules (no React, no database)
  regions/louisville.js     every Louisville-specific fact
  categories.js, scoring.js, grading.js
apps/web/                 the website (was InspectionWebsite/)
  src/app/                app shell: panel/page state, header
  src/api/                every Supabase query, one file per topic
  src/features/           map/, drawer/, filters/, table/, whats-new/, account/, learn/, feedback/
  src/shared/             reusable UI (ScoreBadge, GradePill, Modal, icons) and hooks
pipeline/                 was etl/ + scripts/
  src/sources/arcgis.js     generic ArcGIS client
  src/regions/louisville/   maps Louisville's raw data to our tables
  src/steps/                one file per step
  src/run.js                runs the steps in order, records every run
  tools/                    diagnostics and one-off scripts
supabase/                 complete schema as migrations, plus edge functions
docs/
```

## Phases

| Phase | Work                                                                                                                                                                                                             | Risk       |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 0     | Full schema into `supabase/migrations` (done 2026-11-06); `.gitattributes` for line endings. Tests for logic in `Map.jsx` are written as each piece is extracted (phases 4–5), since it can't be tested in place | Low        |
| 1     | Move folders with `git mv`; npm workspaces; one Node version; one formatting-only commit; CI runs pipeline tests; update `netlify.toml` (done 2026-11-06)                                                        | Low        |
| 2     | `packages/core`: categories, the score scale, county names, the emails; copies deleted (done 2026-11-17, see below)                                                                                              | Low        |
| 3     | Pipeline: ArcGIS client, Louisville adapter, steps, single runner (dry-run first)                                                                                                                                | Medium     |
| 4     | Web data layer: every Supabase query in `api/` (map and drawer 2026-11-08; Table View, What's New, Learn, Saved and the account 2026-11-17). Not done: hooks around them                                         | Medium     |
| 5     | Split `Map.jsx` (done 2026-11-08, see below)                                                                                                                                                                     | Highest    |
| 6     | Remaining components, CSS clean-up, dead code. Split 2026-11-17: Table View, drawer, Learn page, filters (`features/`); dead code removed. Left: CSS clean-up, `WatchlistTab`, `ScoreThreshold`                  | Low–medium |
| 7     | Docs: architecture, "adding a county" (`docs/COUNTIES.md`), decision notes. No CONTRIBUTING: no outside contributors are expected (CLAUDE.md)                                                                    | None       |

After each phase: lint, tests, build and [SMOKE_TEST.md](SMOKE_TEST.md) pass.

### packages/core (done 2026-11-17)

What the website and the pipeline both need, in one place, pure and tested (`packages/core/tests`):

| File                                      | Rule                                                        | Copies it replaced                                                         |
| ----------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------- |
| `categories.js`                           | which facility types make up each category                  | the pipeline's hand-kept list in `coverage_check.js`                       |
| `grading.js`                              | the score badge's bands (95, 85) and what counts as failing | the drawer (twice), Table View, What's New, Saved, the digest email        |
| `regions.js`                              | county ids and names                                        | the email's own list, the names in `pipeline/regions/kyportal/counties.js` |
| `email/digest.js`, `custom.js`, `jobs.js` | the emails and the rules for an email job                   | (new with the email admin page: the preview and the send are one function) |

Left where they are, on purpose: everything about drawing a county (`apps/web/src/lib/regions.js`) and loading one (`pipeline/regions/`) is used by one side only, so it stays with that side. The map's red/yellow/green pin bands (`lib/scoring.js`) are a visitor's own slider setting, not a rule, and stay in the website.

### Splitting Map.jsx (done 2026-11-08)

`Map.jsx` went from about 2,070 lines to a 400-line shell. Each job has one home:

| File                                                                  | Job                                                                    |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `Map.jsx`                                                             | which panels and pages are open, and the layout                        |
| `features/map/AppHeader.jsx`                                          | the top bar                                                            |
| `features/map/useMapFeatures.js`                                      | loads and caches the pins                                              |
| `features/map/useDrawer.js`                                           | opens, closes and loads the info drawer                                |
| `features/map/useWatchlist.js`                                        | saved places (the one save/unsave) and watch areas                     |
| `features/map/useMapLibre.js`                                         | the map: layers, filters, pin hover and click, outside-click, edge pan |
| `features/map/popups.jsx`                                             | every popup, with escaped HTML                                         |
| `features/map/mapLayers.js`                                           | pin and ring layers, applying filters                                  |
| `features/map/useWatchAreaLayer.js`                                   | the watch-area circles and editor                                      |
| `api/mapData.js`, `api/watchlist.js`                                  | the Supabase calls behind them                                         |
| `lib/mapFilters.js`, `lib/mapFeatures.js`, `lib/inspectionHistory.js` | pure logic, tested                                                     |

Not done, and still worth doing: the `data-map-overlay` attribute (the panel list is `KEEP_DRAWER_OPEN` in `useMapLibre.js`). Done 2026-11-17: the `watch-areas-changed` window event became shared state in `useWatchlist` (`setWatchAreas`, `areaEdit`, applied with `lib/watchAreaEdits.js`), which also stopped a read of every watch area after each change (`e2e/saved.spec.js`).

## Decisions

1. **Bugs:** fixed after the refactor step, one commit each. Exception: popup HTML escaping is fixed during the refactor (no visible change).
2. **Score badge colours:** one fixed scale everywhere (95+ green, 85–94 yellow, under 85 red), including the watchlist (which used 85/70 until 2026-11-17). Badges do not follow the map's threshold sliders, so a restaurant shows the same colour everywhere. Easy to revert: it's one function, `scoreBand` in `packages/core/grading.js`.
3. **TypeScript:** not during the refactor. JSDoc types on `core` and `api/`; revisit afterwards.
4. **Folder rename** `InspectionWebsite/` → `apps/web/`: yes, with `netlify.toml` updated.
5. **Counties:** add a `region` column (default Louisville) now. Changing database keys so two counties can share an establishment ID waits until a second county is real.

## Bugs to fix after the refactor

- `pipeline/overlay_geometry.js` never saves coordinates (expects `_lon`/`_lat`, which `fetchArcGISPage` never provides), so new places only get a pin through geocoding.
- `pipeline/etl-accuracy-check.js` queries a different server and field names than the ETL; probably skips or fails every record.
- `pipeline/Recover.js` can't recover `seed_facilities`, which never records its runs.
- Fixed 2026-11-17: a Table View row click opened a simpler copy of the map popup (no date, no save button); it now opens the map's own popup.
- Fixed 2026-11-08: opening a second place before the first one's details arrived showed the first place's card (`useDrawer.js`, with an e2e test).
- The Learn page drill-down shows each place's _current_ score, not its score when cited, and no date. A fix (`get_establishments_for_violation` v2) was written but never reached production, probably because changing a function's return columns needs `DROP FUNCTION` first.
- Fixed with the weekly digest: `unsubscribe_by_token` (called from `AuthContext.jsx`) was missing, so every unsubscribe link said "isn't valid". Migration `20261116000000_weekly_digest.sql` adds it, and every digest email's footer link uses it.
- Unused database objects: decided 2026-11-18, drop. `supabase/migrations/20261127000000_drop_unused_objects.sql` drops `consume_geo_quota` and the `geo_usage*` tables, `v_zip_codes`, `v_latest_insp_per_type`, `v_inspection_table`, `get_violation_flags`, `trg_sync_lonlat`, `profiles.display_name`, and `facility_aliases` and `violation_alerts` if empty. The other alert columns (`alert_email`, `alert_frequency`) are the digest's and stay.
- Fixed 2026-11-17: `seed_categories` ran last, but `facilities` has a foreign key to `facility_categories`, so a brand-new type/subtype pair would have made `backfill_types` fail. `ingest.yml` now loads the categories first.
- `facilities.lon`/`lat` are generated from `geom`, so fixing `overlay_geometry.js` must write only `geom` (writing `lon`/`lat` is an error). The `trg_sync_lonlat` trigger, which did nothing, is dropped by `20261127000000`.
- Redundant indexes: `facilities_establishment_id_uidx` duplicates the primary key; `inspections_establishment_id_idx` is covered by `inspections_est_idx`. Dropped by `supabase/migrations/20261126000000_drop_redundant_indexes.sql` (the first is kept if a foreign key is tied to it).

## Region-specific facts in the database

- `watchlist_areas_bounds` limits watch-area centres to roughly Louisville Metro (lat 37.8–38.6, lon −86.3 to −85.1). A county outside that box needs this widened.

## Security and backups (fixed outside the refactor)

- `feedback` let any signed-in user read all submissions (names, emails) and let anonymous users insert directly, skipping the edge function's rate limit. Fixed by `supabase/migrations/20261106120000_feedback_edge_function_only.sql`. Production uses the edge function (`VITE_FEEDBACK_FUNCTION_URL` is set in Netlify), so the `FeedbackModal.jsx` direct-insert fallback was dead code (removed 2026-11-17; the form now finds the function from the Supabase URL when that variable is unset).
- The nightly backup had been committing empty files since at least July 2026: an old `pg_dump` refused the newer server, and the pipe into `gzip` hid the failure. Fixed in `db-backup.yml` (current client, `pipefail`, minimum-size check).
