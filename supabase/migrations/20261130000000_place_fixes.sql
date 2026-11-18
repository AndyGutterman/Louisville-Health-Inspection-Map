-- The pin control center (/?page=pins, docs/PINS.md): an admin works through the places
-- that have no pin (or a doubtful one), county by county, and fixes them by hand.
--
-- A fix is one of:
--   address  the source's address has a typo the geocoder trips on (PEEWEE VALLEY for
--            PEWEE VALLEY). The correction only feeds the geocoder: the source's own
--            address stays in the place's table and is what the site shows.
--   pin      the address is right but no geocoder finds it: the admin places the pin.
--   hide     leave the place off the map on purpose (a mobile vendor's out-of-state base).
--   skip     looked at, nothing to do for now; out of the queue until undone.
--
-- Fixes are keyed by place id, which is unique across counties (Jefferson's ArcGIS id,
-- `bullitt-…`, `oldham-…`, any future `<county>-…`), so one table serves the whole state.
-- A pin or hide is written to the place's table at once (live on the next map load); an
-- address fix waits for the pin-fixes job (pipeline/pins/run.js), which runs the county's
-- full geocoding chain on just the pending fixes and writes what it finds.
--
-- Everything here is for admins only: the table and views are closed to the API, and
-- every admin_* function checks admin_users (assert_admin, migration 20261125000000).
-- The daily jobs read place_fixes with the service role (pipeline/lib/placeFixes.js).

-- ── The fixes ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.place_fixes (
  place_id text PRIMARY KEY,
  region text NOT NULL,                 -- 'jefferson', 'bullitt', 'oldham', ...
  action text NOT NULL CHECK (action IN ('address', 'pin', 'hide', 'skip')),
  -- address: the corrected address and town (null = as the source has it)
  address text,
  city text,
  -- pin: where the admin put it
  lon double precision,
  lat double precision,
  note text,
  -- The place as it was before its first fix, kept for Undo and for the record. Not
  -- changed by later fixes of the same place.
  source_name text,
  source_address text,
  source_city text,
  source_lon double precision,
  source_lat double precision,
  source_provider text,
  source_outside boolean,
  -- address fixes: what the pin-fixes job made of it
  status text NOT NULL DEFAULT 'done'
    CHECK (status IN ('pending', 'found', 'not_found', 'outside', 'done')),
  result_lon double precision,
  result_lat double precision,
  result_provider text,
  result_query text,
  tried_at timestamptz,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (action <> 'pin' OR (lon IS NOT NULL AND lat IS NOT NULL)),
  CHECK (action <> 'address' OR address IS NOT NULL OR city IS NOT NULL),
  -- Roughly Kentucky (packages/core/coords.js KY_BOX): catches swapped numbers.
  CHECK (lon IS NULL OR (lat BETWEEN 36.4 AND 39.2 AND lon BETWEEN -89.6 AND -81.9))
);
CREATE INDEX IF NOT EXISTS place_fixes_region_status ON public.place_fixes (region, status);
ALTER TABLE public.place_fixes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.place_fixes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.place_fixes TO service_role;

-- A pin placed by hand on a Jefferson place says so in loc_source too.
ALTER TABLE public.facilities DROP CONSTRAINT IF EXISTS facilities_loc_source_check;
ALTER TABLE public.facilities ADD CONSTRAINT facilities_loc_source_check
  CHECK (loc_source = ANY (ARRAY['legacy', 'foodmapping', 'nominatim', 'census', 'manual']));

-- ── Every place, one shape ───────────────────────────────────────────────────────────
-- Jefferson from facilities; Bullitt from bullitt_establishments (its pins' table); every
-- other county from portal_establishments, so a new portal county needs no SQL. A
-- Jefferson pin with no geocode_provider came from Louisville Metro's own data.
CREATE OR REPLACE VIEW public.v_admin_places AS
SELECT
  'jefferson'::text AS region,
  f.establishment_id AS id,
  f.name,
  f.address,
  f.city,
  f.lon,
  f.lat,
  f.geocode_provider AS provider,
  NULL::boolean AS outside_county,
  COALESCE(f.active, true) AS active,
  (SELECT max(i.inspection_date) FROM public.inspections i
    WHERE i.establishment_id = f.establishment_id) AS last_inspected
FROM public.facilities f
UNION ALL
SELECT
  'bullitt', e.id, e.name, e.address, e.city, e.lon, e.lat, e.geocode_provider,
  e.geocode_outside_county, e.active,
  (SELECT max(p.inspection_date) FROM public.portal_inspections p
    WHERE p.establishment_id = e.id)
FROM public.bullitt_establishments e
UNION ALL
SELECT
  e.region, e.id, e.name, e.address, e.city, e.lon, e.lat, e.geocode_provider,
  e.geocode_outside_county, e.active,
  (SELECT max(p.inspection_date) FROM public.portal_inspections p
    WHERE p.establishment_id = e.id)
FROM public.portal_establishments e
WHERE e.region <> 'bullitt';

-- Each place with its fix and the queue it belongs in (null: nothing to look at).
-- The order of the CASE is the rule: a fix decides first, then the place's pin.
CREATE OR REPLACE VIEW public.v_admin_pin_rows AS
SELECT
  p.*,
  x.action AS fix_action,
  x.address AS fix_address,
  x.city AS fix_city,
  x.lon AS fix_lon,
  x.lat AS fix_lat,
  x.note AS fix_note,
  x.status AS fix_status,
  x.result_lon,
  x.result_lat,
  x.result_provider,
  x.result_query,
  x.tried_at,
  x.source_address,
  x.source_city,
  x.updated_at AS fixed_at,
  CASE
    WHEN x.action = 'hide' THEN 'hidden'
    WHEN x.action = 'skip' THEN 'skipped'
    WHEN x.action = 'pin' THEN 'fixed'
    WHEN x.action = 'address' AND x.status = 'pending' THEN 'pending'
    WHEN x.action = 'address' AND x.status IN ('found', 'done') THEN 'fixed'
    WHEN x.action = 'address' THEN 'retry' -- not found, or found outside the county
    WHEN NOT p.active THEN NULL
    WHEN p.lon IS NULL THEN 'missing'
    WHEN p.outside_county THEN 'outside'
    WHEN p.provider = 'ky911-approx' THEN 'approx'
  END AS bucket
FROM public.v_admin_places p
LEFT JOIN public.place_fixes x ON x.place_id = p.id;

REVOKE ALL ON public.v_admin_places, public.v_admin_pin_rows FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_admin_places, public.v_admin_pin_rows TO service_role;

-- ── Writing a place's pin (helpers; not callable from the API) ───────────────────────
-- p_provider 'manual' (placed by hand), 'hidden' (left off on purpose), or a geocoder's
-- name (the pin-fixes job). A null point clears the pin. Bullitt's places are in both
-- bullitt_establishments and the portal's table with the same id, so both are written.
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
END;
$$;
REVOKE ALL ON FUNCTION public.place_fix_write_pin(text, text, double precision, double precision, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_fix_write_pin(text, text, double precision, double precision, text, boolean)
  TO service_role;

-- Put a place back as it was before its first fix (Undo, or a pin replaced by an address
-- fix). With no earlier pin, the geocoders may try it again on the next daily run.
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
END;
$$;
REVOKE ALL ON FUNCTION public.place_fix_restore(public.place_fixes) FROM PUBLIC, anon, authenticated;

-- Did this fix put the place's current pin there (so Undo has something to take back)?
CREATE OR REPLACE FUNCTION public.place_fix_owns_pin(p_fix public.place_fixes)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT p_fix.action IN ('pin', 'hide')
      OR (p_fix.action = 'address' AND p_fix.status = 'found');
$$;
REVOKE ALL ON FUNCTION public.place_fix_owns_pin(public.place_fixes) FROM PUBLIC, anon, authenticated;

-- ── What the admin page calls ────────────────────────────────────────────────────────

-- How many places are in each queue, per county: the county chips and filter tabs.
CREATE OR REPLACE FUNCTION public.admin_pin_counts()
RETURNS TABLE (region text, bucket text, n bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
    SELECT r.region, r.bucket, count(*)
    FROM public.v_admin_pin_rows r
    WHERE r.bucket IS NOT NULL
    GROUP BY r.region, r.bucket;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_pin_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_pin_counts() TO authenticated;

-- One page of a county's queue, most recently inspected first (the places people look
-- up). same_address: other places in the county at the same address, which a fix can
-- cover in one go (two businesses in one strip mall). At most 50 rows a page.
CREATE OR REPLACE FUNCTION public.admin_pin_queue(
  p_region text, p_bucket text, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0
)
RETURNS TABLE (
  region text, id text, name text, address text, city text,
  lon double precision, lat double precision, provider text, outside_county boolean,
  active boolean, last_inspected date,
  fix_action text, fix_address text, fix_city text, fix_lon double precision,
  fix_lat double precision, fix_note text, fix_status text,
  result_lon double precision, result_lat double precision, result_provider text,
  result_query text, tried_at timestamptz, source_address text, source_city text,
  fixed_at timestamptz, bucket text, same_address text[]
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
    SELECT
      r.region, r.id, r.name, r.address, r.city, r.lon, r.lat, r.provider,
      r.outside_county, r.active, r.last_inspected::date,
      r.fix_action, r.fix_address, r.fix_city, r.fix_lon, r.fix_lat, r.fix_note,
      r.fix_status, r.result_lon, r.result_lat, r.result_provider, r.result_query,
      r.tried_at, r.source_address, r.source_city, r.fixed_at, r.bucket,
      ARRAY(
        SELECT o.id FROM public.v_admin_places o
        WHERE o.region = r.region AND o.id <> r.id AND o.active
          AND upper(btrim(o.address)) = upper(btrim(r.address))
          AND upper(btrim(coalesce(o.city, ''))) = upper(btrim(coalesce(r.city, '')))
        ORDER BY o.id
        LIMIT 20
      )
    FROM public.v_admin_pin_rows r
    WHERE r.region = p_region AND r.bucket = p_bucket
    ORDER BY r.last_inspected DESC NULLS LAST, r.name, r.id
    LIMIT least(greatest(coalesce(p_limit, 25), 1), 50)
    OFFSET greatest(coalesce(p_offset, 0), 0);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_pin_queue(text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_pin_queue(text, text, integer, integer) TO authenticated;

-- Save a fix for a place, and for the other places at its address when asked (p_also,
-- up to 20). A pin or hide goes on the map at once; an address fix is queued for the
-- pin-fixes job. Saving over a pin or hide with an address fix or skip puts the place's
-- old pin back first. Returns how many places were saved.
CREATE OR REPLACE FUNCTION public.admin_save_place_fix(
  p_place_id text,
  p_action text,
  p_address text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_lon double precision DEFAULT NULL,
  p_lat double precision DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_also text[] DEFAULT '{}'
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id text;
  v_place record;
  v_old public.place_fixes;
  v_n integer := 0;
BEGIN
  PERFORM public.assert_admin();
  IF p_action IS NULL OR p_action NOT IN ('address', 'pin', 'hide', 'skip') THEN
    RAISE EXCEPTION 'Unknown fix "%"', p_action USING ERRCODE = '22023';
  END IF;
  IF cardinality(coalesce(p_also, '{}')) > 20 THEN
    RAISE EXCEPTION 'At most 20 other places at once' USING ERRCODE = '22023';
  END IF;

  FOREACH v_id IN ARRAY array_prepend(p_place_id, coalesce(p_also, '{}')) LOOP
    SELECT * INTO v_place FROM public.v_admin_places WHERE id = v_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No place with id %', v_id USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_old FROM public.place_fixes WHERE place_id = v_id;
    IF FOUND AND public.place_fix_owns_pin(v_old) AND p_action IN ('address', 'skip') THEN
      PERFORM public.place_fix_restore(v_old);
    END IF;

    INSERT INTO public.place_fixes AS x (
      place_id, region, action, address, city, lon, lat, note, status,
      source_name, source_address, source_city, source_lon, source_lat, source_provider,
      source_outside, created_by
    ) VALUES (
      v_id, v_place.region, p_action,
      CASE WHEN p_action = 'address' THEN nullif(btrim(p_address), '') END,
      CASE WHEN p_action = 'address' THEN nullif(btrim(p_city), '') END,
      CASE WHEN p_action = 'pin' THEN p_lon END,
      CASE WHEN p_action = 'pin' THEN p_lat END,
      nullif(btrim(p_note), ''),
      CASE WHEN p_action = 'address' THEN 'pending' ELSE 'done' END,
      v_place.name, v_place.address, v_place.city, v_place.lon, v_place.lat,
      v_place.provider, v_place.outside_county, auth.uid()
    )
    ON CONFLICT (place_id) DO UPDATE SET
      action = excluded.action,
      address = excluded.address,
      city = excluded.city,
      lon = excluded.lon,
      lat = excluded.lat,
      note = excluded.note,
      status = excluded.status,
      result_lon = NULL,
      result_lat = NULL,
      result_provider = NULL,
      result_query = NULL,
      tried_at = NULL,
      created_by = excluded.created_by,
      updated_at = now();
      -- source_* stay as they were before the first fix.

    IF p_action = 'pin' THEN
      PERFORM public.place_fix_write_pin(v_place.region, v_id, p_lon, p_lat, 'manual');
    ELSIF p_action = 'hide' THEN
      PERFORM public.place_fix_write_pin(v_place.region, v_id, NULL, NULL, 'hidden');
    END IF;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_save_place_fix(text, text, text, text, double precision, double precision, text, text[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_place_fix(text, text, text, text, double precision, double precision, text, text[])
  TO authenticated;

-- Undo: remove a place's fix and put back the pin it had before (or none, so the daily
-- geocoding tries it again).
CREATE OR REPLACE FUNCTION public.admin_clear_place_fix(p_place_id text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old public.place_fixes;
BEGIN
  PERFORM public.assert_admin();
  SELECT * INTO v_old FROM public.place_fixes WHERE place_id = p_place_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF public.place_fix_owns_pin(v_old) THEN
    PERFORM public.place_fix_restore(v_old);
  END IF;
  DELETE FROM public.place_fixes WHERE place_id = p_place_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_clear_place_fix(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_clear_place_fix(text) TO authenticated;

-- The outcome of some address fixes: what the page polls while the pin-fixes job runs.
CREATE OR REPLACE FUNCTION public.admin_place_fix_status(p_ids text[])
RETURNS TABLE (
  place_id text, status text, result_lon double precision, result_lat double precision,
  result_provider text, result_query text, tried_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.assert_admin();
  IF cardinality(coalesce(p_ids, '{}')) > 100 THEN
    RAISE EXCEPTION 'At most 100 ids at once' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
    SELECT x.place_id, x.status, x.result_lon, x.result_lat, x.result_provider,
           x.result_query, x.tried_at
    FROM public.place_fixes x
    WHERE x.place_id = ANY (p_ids);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_place_fix_status(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_place_fix_status(text[]) TO authenticated;
