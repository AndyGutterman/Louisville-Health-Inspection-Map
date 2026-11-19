---
paths:
  - "supabase/**"
  - "apps/web/src/api/**"
  - "pipeline/*.js"
  - "pipeline/lib/**"
  - ".github/workflows/{ingest,db-backup,etl-check,schema-dump}.yml"
---

# The database, its reads and the pipeline

- **Egress (5 GB a month)**, what costs it, biggest first: a fresh map load, Table View pages, the weekly `pg_dump` (`db-backup.yml`: Sundays only, a tiny dump of the tables that can't be rebuilt plus the new rows of `facilities`, `inspections` and `inspection_violations`, about 0.5 MB a run; a full dump, about 12 MB, only when run by hand). Keep backups tiny: the owner prefers thin backups over egress.
- **Every new read** says how many rows and columns it returns per visit, and whether it runs again on a re-render, a county toggle or a tab switch. Name the columns (`no-select-star-in-browser`). Don't add a read that pages through a whole table from the browser, and don't add a fallback that does (the Learn page had one; Jefferson's pins had one, removed 2026-11-18).
- **Migrations:** a new file in `supabase/migrations/` (the baseline plus later changes; Prettier skips the folder). The owner runs it; nothing in the code may assume it has run. Say so in the PR. A new table enables row level security and has policies; a `security definer` function sets `search_path`, and an `admin_*` function checks `admin_users`.
- **No `.env` and no database password in the cloud.** Pipeline scripts and SQL against the real project are the owner's to run (the guard hook blocks them).
- **Pipeline (refactor phase 3, not started)**, known bugs, for a machine that can run against the database, dry run first, and only once egress has reset: `overlay_geometry.js` never saves coordinates (it should write `geom` only); `etl-accuracy-check.js` reads a different server and fields than the ingest; `seed_facilities` doesn't record its runs, so `Recover.js` can't recover it; Jefferson's ingest has no "refuse a source that shrank" guard like the portal and Bullitt jobs. Plan in `docs/REFACTOR_PLAN.md`.
- **The data's `critical_yn` column** is still stored; `critical_count`/`critical_6mo` in the functions are deprecated. Nothing reads them (CLAUDE.md, the laws).
