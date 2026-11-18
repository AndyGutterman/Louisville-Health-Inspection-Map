-- Drops database objects nothing uses (checked 2026-11-18 against the website, the
-- pipeline, the edge functions, the workflows and every other view and function).
-- docs/REFACTOR_PLAN.md listed them under "Unused database objects: decide build or drop";
-- the owner chose drop. Ingestion and its fallbacks are untouched: the Bullitt sheet
-- import, the portal tables, geocode_cache, import_runs and v_facility_map_feed (Top
-- Scores and the Learn page's drill-down read it) all stay.
--
--   get_violation_flags()          the website's old fallback read it; that fallback is
--                                  gone (the site reads v_facility_map_pins only)
--   consume_geo_quota(),           a per-user geocoding quota that was never wired up;
--   geo_usage, geo_usage_global    the tables only held its counters
--   v_latest_insp_per_type,        only used by each other
--   v_inspection_table
--   v_zip_codes                    no reader
--   trg_sync_lonlat,               copied geom into lon/lat, which are generated from geom
--   sync_lonlat_from_geom()        anyway, so it did nothing
--   facility_aliases,              never built. Dropped only if empty: a row here would be
--   violation_alerts               something someone typed in, so it is kept and named
--   profiles.display_name          never written or read
--
-- Each drop that something could still depend on runs on its own and, if Postgres says
-- another object needs it, is skipped with a NOTICE instead of failing the whole file.
-- Safe to run more than once. Read the NOTICE lines in the output: each says what it did.

DO $$
DECLARE
  n bigint;
  stmt text;
BEGIN
  -- Functions and views nothing calls.
  FOREACH stmt IN ARRAY ARRAY[
    'DROP FUNCTION IF EXISTS public.get_violation_flags()',
    'DROP FUNCTION IF EXISTS public.consume_geo_quota(integer, integer)',
    'DROP VIEW IF EXISTS public.v_latest_insp_per_type',
    'DROP VIEW IF EXISTS public.v_inspection_table',
    'DROP VIEW IF EXISTS public.v_zip_codes',
    'DROP TRIGGER IF EXISTS trg_sync_lonlat ON public.facilities',
    'DROP FUNCTION IF EXISTS public.sync_lonlat_from_geom()',
    'DROP TABLE IF EXISTS public.geo_usage',
    'DROP TABLE IF EXISTS public.geo_usage_global',
    'ALTER TABLE public.profiles DROP COLUMN IF EXISTS display_name'
  ] LOOP
    BEGIN
      EXECUTE stmt;
      RAISE NOTICE 'done: %', stmt;
    EXCEPTION WHEN dependent_objects_still_exist THEN
      RAISE NOTICE 'kept (something still depends on it): %', stmt;
    END;
  END LOOP;

  -- Tables a person could have typed rows into: dropped only when empty.
  IF to_regclass('public.facility_aliases') IS NOT NULL THEN
    SELECT count(*) INTO n FROM public.facility_aliases;
    IF n = 0 THEN
      DROP TABLE public.facility_aliases;
      RAISE NOTICE 'done: dropped facility_aliases (it was empty)';
    ELSE
      RAISE NOTICE 'kept facility_aliases: it has % row(s); look at them before dropping', n;
    END IF;
  END IF;

  IF to_regclass('public.violation_alerts') IS NOT NULL THEN
    SELECT count(*) INTO n FROM public.violation_alerts;
    IF n = 0 THEN
      DROP TABLE public.violation_alerts;
      RAISE NOTICE 'done: dropped violation_alerts (it was empty)';
    ELSE
      RAISE NOTICE 'kept violation_alerts: it has % row(s); look at them before dropping', n;
    END IF;
  END IF;
END $$;
