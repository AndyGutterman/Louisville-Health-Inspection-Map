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

| Phase | Work | Risk |
|---|---|---|
| 0 | Full schema into `supabase/migrations`; `.gitattributes` for line endings; tests that pin down current behaviour of code about to move (drawer history merge, filter building, popup HTML) | Low |
| 1 | Move folders with `git mv`; npm workspaces; one Node version; one formatting-only commit; CI runs pipeline tests; update `netlify.toml` | Low |
| 2 | `packages/core`: region config, categories, scoring; delete the copies | Low |
| 3 | Pipeline: ArcGIS client, Louisville adapter, steps, single runner (dry-run first) | Medium |
| 4 | Web data layer: `api/` modules and hooks | Medium |
| 5 | Split `Map.jsx` (see below) | Highest |
| 6 | Remaining components, CSS clean-up, dead code | Low–medium |
| 7 | Docs: architecture, CONTRIBUTING, "adding a county", decision notes | None |

After each phase: lint, tests, build and [SMOKE_TEST.md](SMOKE_TEST.md) pass.

### Splitting Map.jsx

| New file | Job |
|---|---|
| `app/App.jsx` | which panels and pages are open |
| `app/AppHeader.jsx` | header |
| `features/map/MapView.jsx` | creates the map and wires its events |
| `features/map/layers.js` | pin and ring layer definitions |
| `features/map/filterExpression.js` | builds the MapLibre filter (pure, tested) |
| `features/map/pinPicking.js` | which pin a click means (pure, tested) |
| `features/map/popupHtml.js` | popup HTML, with escaping (pure, tested) |
| `useMapFeatures` | loads and caches map data |
| `useDrawer` | opens, closes and loads the info drawer |
| `useWatchlist` | the one save/remove implementation |
| `useWatchAreas` | shared watch-area state (replaces the `window` event) |

A `data-map-overlay` attribute on panels replaces the class-name list that decides what closes the drawer.

## Decisions

1. **Bugs:** fixed after the refactor step, one commit each. Exception: popup HTML escaping is fixed during the refactor (no visible change).
2. **Score badge colours:** one fixed scale everywhere (95+ green, 85–94 yellow, under 85 red), including the watchlist (which used 85/70). Badges do not follow the map's threshold sliders, so a restaurant shows the same colour everywhere. Easy to revert: it's one function in `packages/core/scoring.js`.
3. **TypeScript:** not during the refactor. JSDoc types on `core` and `api/`; revisit afterwards.
4. **Folder rename** `InspectionWebsite/` → `apps/web/`: yes, with `netlify.toml` updated.
5. **Counties:** add a `region` column (default Louisville) now. Changing database keys so two counties can share an establishment ID waits until a second county is real.

## Bugs to fix after the refactor

- `etl/overlay_geometry.js` never saves coordinates (expects `_lon`/`_lat`, which `fetchArcGISPage` never provides), so new places only get a pin through geocoding.
- `scripts/etl-accuracy-check.js` queries a different server and field names than the ETL; probably skips or fails every record.
- `etl/Recover.js` can't recover `seed_facilities`, which never records its runs.
- The table view's row-click popup is a simpler copy of the map popup (no save button).
- `supabase/migrations/20260619_accounts.sql` allows radii 5/10/15/25; the live database allows 1–25. Phase 0's schema export replaces it.
