-- When each county's data last finished loading, so a visitor's saved map pins are read
-- again only after a load (apps/web/src/lib/mapCache.js), not at a fixed hour.
--
-- One row per county ('jefferson', 'bullitt'), written by the pipeline with the service
-- role at the end of a load that changed something (pipeline/mark_loaded.js, the Bullitt
-- ingest), and by place_fix_write_pin and place_fix_restore whenever a pin is placed by
-- hand or put back (below). The website reads both rows once per visit: about 100 bytes.
--
-- Safe to run more than once. Nothing assumes it has run: until it has, the pipeline logs
-- a warning and carries on, and the website keeps the old rule (pins refresh once a day).
-- No personal data.

CREATE TABLE IF NOT EXISTS public.data_loads (
  region text PRIMARY KEY CHECK (region ~ '^[a-z]+$'),
  loaded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.data_loads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS data_loads_read ON public.data_loads;
CREATE POLICY data_loads_read ON public.data_loads
  FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON public.data_loads TO anon, authenticated;
GRANT ALL ON public.data_loads TO service_role;

-- ── A pin placed by hand moves the stamp too ──────────────────────────────────────────
-- The pin control center (admin_save_place_fix) and the pin-fixes job
-- (place_fix_record_result) write every new pin through place_fix_write_pin; Undo
-- (admin_clear_place_fix) and a fix saved over a hand pin put the old one back through
-- place_fix_restore (further down). Visitors' saved pins refreshed daily before; now
-- they refresh when the stamp moves, so both helpers move it. The body is 20261130000000_place_fixes.sql's, unchanged, plus the last
-- statement. (Needs that migration's tables; until it has run, no fix is ever written.)
CREATE OR REPLACE FUNCTION public.place_fix_write_pin(
  p_region text, p_id text, p_lon double precision, p_lat double precision,
  p_provider text, p_outside boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_region = 'jefferson' THEN
    UPDATE public.facilities SET
      geom = CASE WHEN p_lon IS NULL THEN NULL
                  ELSE public.st_setsrid(public.st_makepoint(p_lon, p_lat), 4326)::public.geography END,
      loc_source = 'manual',
      geocode_provider = p_provider,
      is_approximate = p_provider NOT IN ('manual', 'hidden'),
      updated_at = now()
    WHERE establishment_id = p_id;
  ELSE
    UPDATE public.bullitt_establishments SET
      lon = p_lon, lat = p_lat, geocode_provider = p_provider,
      geocode_outside_county = CASE WHEN p_lon IS NULL THEN NULL ELSE p_outside END,
      geocoded_at = now()
    WHERE id = p_id;
    UPDATE public.portal_establishments SET
      lon = p_lon, lat = p_lat, geocode_provider = p_provider,
      geocode_outside_county = CASE WHEN p_lon IS NULL THEN NULL ELSE p_outside END,
      geocoded_at = now()
    WHERE id = p_id;
  END IF;

  INSERT INTO public.data_loads (region, loaded_at) VALUES (p_region, now())
    ON CONFLICT (region) DO UPDATE SET loaded_at = excluded.loaded_at;
END;
$$;
REVOKE ALL ON FUNCTION public.place_fix_write_pin(text, text, double precision, double precision, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_fix_write_pin(text, text, double precision, double precision, text, boolean)
  TO service_role;

-- Undo, and an address fix or skip saved over a hand pin, put the old pin back through
-- place_fix_restore: the same stamp. Body unchanged from 20261130000000, plus the upsert.
CREATE OR REPLACE FUNCTION public.place_fix_restore(p_fix public.place_fixes)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_fix.region = 'jefferson' THEN
    UPDATE public.facilities SET
      geom = CASE WHEN p_fix.source_lon IS NULL THEN NULL
                  ELSE public.st_setsrid(public.st_makepoint(p_fix.source_lon, p_fix.source_lat), 4326)::public.geography END,
      loc_source = 'legacy',
      geocode_provider = p_fix.source_provider,
      is_approximate = p_fix.source_provider IS NOT NULL,
      updated_at = now()
    WHERE establishment_id = p_fix.place_id;
  ELSE
    UPDATE public.bullitt_establishments SET
      lon = p_fix.source_lon, lat = p_fix.source_lat,
      geocode_provider = p_fix.source_provider,
      geocode_outside_county = p_fix.source_outside,
      geocoded_at = CASE WHEN p_fix.source_lon IS NULL THEN NULL ELSE now() END
    WHERE id = p_fix.place_id;
    UPDATE public.portal_establishments SET
      lon = p_fix.source_lon, lat = p_fix.source_lat,
      geocode_provider = p_fix.source_provider,
      geocode_outside_county = p_fix.source_outside,
      geocoded_at = CASE WHEN p_fix.source_lon IS NULL THEN NULL ELSE now() END
    WHERE id = p_fix.place_id;
  END IF;

  INSERT INTO public.data_loads (region, loaded_at) VALUES (p_fix.region, now())
    ON CONFLICT (region) DO UPDATE SET loaded_at = excluded.loaded_at;
END;
$$;
REVOKE ALL ON FUNCTION public.place_fix_restore(public.place_fixes) FROM PUBLIC, anon, authenticated;
