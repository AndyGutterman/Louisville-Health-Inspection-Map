# Database

`migrations/` holds the database schema. The first file, `20261106000000_baseline.sql`, is a snapshot of production: every table, view, function, trigger, row-level security policy and grant in the `public` schema. Read it to see how the database is built.

## Changing the schema

1. Write the change as a new file in `migrations/`, named `YYYYMMDDHHMMSS_short_description.sql` (UTC time), so files sort in the order they were applied.
2. Run it in the Supabase dashboard's SQL editor.
3. Commit the file in the same PR as the code that needs it.

Never edit a migration that has already been run; add a new one instead.

Changing what a function returns needs `DROP FUNCTION` first, because `CREATE OR REPLACE FUNCTION` can't change return columns.

## Checking for drift

If you suspect production no longer matches the files here, run **Export database schema** from the repo's Actions tab, download `schema.sql` from the finished run, and compare it with the migrations.

The workflow, like the nightly backup, connects through the Supabase session pooler (`SUPABASE_DB_URL` secret). The direct database address is IPv6-only, which GitHub's runners can't reach.

## Other pieces

- `functions/submit-feedback/`: edge function that rate-limits feedback by IP and writes to `feedback`.
