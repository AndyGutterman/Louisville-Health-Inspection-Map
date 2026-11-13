-- Stops the public (anon) key from downloading data the site never shows.
--
-- Why: the site's key is public by design, so anyone can call the database's REST API
-- with it. Row-level security already blocks writes, but these were readable by anyone,
-- and none of them is read by the site. Bytes they download count against the project's
-- monthly egress like any other:
--
--   inspections.raw        the source record for every inspection (jsonb, by far the
--                          biggest column in the database). A loop of
--                          /rest/v1/inspections?select=* pulls about 1,000 of them per
--                          request, for as long as it likes.
--   facilities.geocode_meta  the geocoder's full answer for every place (jsonb)
--   geocode_cache, import_runs, facility_aliases   pipeline bookkeeping
--   v_latest_inspection    an old view that returns `raw`; nothing reads it since
--                          20261117000000_fast_map_feed.sql
--
-- The pipeline is unaffected: it uses the service-role key, which bypasses all of this.
-- The site is unaffected: every read in apps/web names its columns, and none of them is
-- one of these (checked 2026-11-13: `git grep -n "\.from(\|\.rpc(" apps/web/src`).
--
-- RUN THIS ONE ON ITS OWN, then load the site in a private window with ?bust=1 added to
-- the address, open a place's drawer, and open Table View. If anything fails to load, run
-- the "Undo" block at the bottom: it puts back exactly what was there.
-- Safe to run more than once.

-- Pipeline bookkeeping: no public reads at all.
REVOKE ALL ON public.geocode_cache, public.import_runs, public.facility_aliases
  FROM anon, authenticated;

-- The old view that carries `raw`.
REVOKE ALL ON public.v_latest_inspection FROM anon, authenticated;

-- inspections: every column but `raw`. (A column list replaces the table-wide grant.)
REVOKE ALL ON public.inspections FROM anon, authenticated;
GRANT SELECT (inspection_id, establishment_id, ins_type_desc, inspection_date, score, grade, created_at)
  ON public.inspections TO anon, authenticated;

-- facilities: every column but `geocode_meta`.
REVOKE ALL ON public.facilities FROM anon, authenticated;
GRANT SELECT (
  establishment_id, permit_number, name, address, city, state, zip, name_search, addr_search,
  facility_type, subtype, loc_source, is_approximate, geom, lon, lat, geocode_provider,
  geocode_confidence, active, created_at, updated_at, opening_date
) ON public.facilities TO anon, authenticated;

-- Check (should list no rows: the public key can no longer read these columns):
--   SELECT table_name, column_name FROM information_schema.column_privileges
--   WHERE grantee = 'anon' AND table_schema = 'public'
--     AND (table_name, column_name) IN (('inspections', 'raw'), ('facilities', 'geocode_meta'));

-- Undo:
--   GRANT ALL ON public.inspections, public.facilities, public.v_latest_inspection,
--     public.geocode_cache, public.import_runs, public.facility_aliases
--     TO anon, authenticated;
