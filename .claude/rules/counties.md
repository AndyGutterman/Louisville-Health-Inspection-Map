---
paths:
  - "pipeline/regions/**"
  - "pipeline/lib/county*.js"
  - "packages/core/regions.js"
  - "apps/web/src/lib/{regions,bullitt}.js"
  - "apps/web/src/api/{bullitt,portal}.js"
  - "docs/{BULLITT,COUNTIES}.md"
  - ".github/workflows/{bullitt-ingest,portal-ingest}.yml"
---

# Counties: Jefferson, Bullitt and the paused portal

- **Kentucky's portal is PAUSED (2026-11-18)** until the owner has permission to use it: no permission has been asked for or given, and CDP's site terms forbid copying and public display. Oldham, Shelby and Spencer are `enabled: false`, the site can't read the `portal_*` tables (migration `20261201000000`), `portal-ingest.yml` has no schedule; nothing was deleted. Don't turn any of it back on, run the job, or add a portal county without the owner saying permission is in hand (`docs/COUNTIES.md`, "Paused").
- **County ids and names:** `packages/core/regions.js`, for the site, the pipeline and the emails. A new county starts there, and needs `labelAt` in `apps/web/src/lib/regions.js`. Per-county capabilities, agency and data sources are in `lib/regions.js` (`has`, `agency`, `source`, `dataNote`; the Learn page shows one link and a data note per county).
- **Bullitt County:** read `docs/BULLITT.md` first. Separate `bullitt_*` tables, `pipeline/regions/bullitt/`. Results come from the county's sheet only while the portal is paused: every Bullitt reader reads the `bullitt_results` view (sheet-only since migration `20261201000000`; it picked the portal when fresh before that). Its pins show once the county is switched on. Geocoding order and the redo switch: `docs/BULLITT.md`. Bullitt ids start with `bullitt-` (`lib/bullitt.js`). Whether approximate pins (`ky911-approx`) should look different is the owner's open decision (`docs/BULLITT.md`, Decisions 9).
- **How the portal worked** (`docs/COUNTIES.md`): Kentucky's statewide inspection portal has every county, with dates; `pipeline/regions/kyportal/` reads one (two requests) and stores it daily in the `portal_*` tables (`portal-ingest.yml`). Jefferson stays on ArcGIS, and Bullitt's sheet import stays as the fallback: the portal never replaces a source we had ("If the portal goes away" in that doc). Shared helpers for id-less sources: `pipeline/lib/countyRows.js` (rows) and `pipeline/lib/countyGeocode.js` (pins). Hardin (about twice Oldham's size) was left out.
- `pipeline/tests/fixtures/` holds the sources' saved pages byte for byte (`.prettierignore`); never reformat them.
