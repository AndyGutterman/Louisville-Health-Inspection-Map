-- Both counties on one map: Bullitt County in saved places, watch areas and Table View.
--
-- The map now shows Jefferson and Bullitt pins together (no county toggle), so:
--
--   watchlist               can hold Bullitt ids too. Its foreign key to facilities is
--                           replaced by a trigger that accepts an id from either county,
--                           plus delete triggers that keep the old ON DELETE CASCADE.
--   v_watchlist_with_latest + Bullitt rows, + region.
--   watch_zone_places       + Bullitt places inside the circle, + region.
--   v_table_inspections     NEW: every inspection from both counties (Table View with
--                           "Unique" off), with region, city, facility type and subtype.
--   v_table_latest          NEW: the latest inspection per place and type, both counties
--                           (Table View's default). Replaces the old pair of views for the
--                           site; v_inspection_table and v_latest_insp_per_type stay, so the
--                           site that is live before this change keeps working. They can be
--                           dropped once nothing reads them.
--
-- Bullitt rows (docs/BULLITT.md): the routine inspection has no date; "routine" shows as
-- REGULAR and "follow_up" as FOLLOWUP, so Table View's type chips cover both counties.
-- For Bullitt, violations_6mo is the number of violations on the latest inspection, since
-- the sheet doesn't say when it happened.
--
-- Needs 20261110000000_bullitt_county.sql first. Safe to run more than once.

-- Saved places: accept either county's ids ---------------------------------------------
ALTER TABLE public.watchlist DROP CONSTRAINT IF EXISTS watchlist_establishment_id_fkey;

CREATE OR REPLACE FUNCTION public.watchlist_check_establishment()
RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM facilities WHERE establishment_id = NEW.establishment_id)
     OR EXISTS (SELECT 1 FROM bullitt_establishments WHERE id = NEW.establishment_id) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'unknown establishment %', NEW.establishment_id
    USING ERRCODE = 'foreign_key_violation';
END;
$$;

DROP TRIGGER IF EXISTS watchlist_establishment_exists ON public.watchlist;
CREATE TRIGGER watchlist_establishment_exists
  BEFORE INSERT OR UPDATE OF establishment_id ON public.watchlist
  FOR EACH ROW EXECUTE FUNCTION public.watchlist_check_establishment();

-- What the foreign key's ON DELETE CASCADE did, for each county's table.
CREATE OR REPLACE FUNCTION public.watchlist_forget_facility()
RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  DELETE FROM watchlist WHERE establishment_id = OLD.establishment_id;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.watchlist_forget_bullitt()
RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  DELETE FROM watchlist WHERE establishment_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS watchlist_forget ON public.facilities;
CREATE TRIGGER watchlist_forget AFTER DELETE ON public.facilities
  FOR EACH ROW EXECUTE FUNCTION public.watchlist_forget_facility();

DROP TRIGGER IF EXISTS watchlist_forget ON public.bullitt_establishments;
CREATE TRIGGER watchlist_forget AFTER DELETE ON public.bullitt_establishments
  FOR EACH ROW EXECUTE FUNCTION public.watchlist_forget_bullitt();

REVOKE ALL ON FUNCTION public.watchlist_check_establishment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.watchlist_forget_facility() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.watchlist_forget_bullitt() FROM PUBLIC, anon, authenticated;

-- Saved places view ----------------------------------------------------------------------
-- CREATE OR REPLACE VIEW may add columns at the end (region), so no drop is needed.
CREATE OR REPLACE VIEW public.v_watchlist_with_latest AS
 SELECT w.id,
    w.user_id,
    w.establishment_id,
    f.name,
    f.address,
    f.city,
    li.inspection_date,
    li.score,
    li.grade,
    COALESCE(c.critical_6mo, (0)::bigint) AS critical_6mo, -- deprecated
    COALESCE(c.violations_6mo, (0)::bigint) AS violations_6mo,
    'jefferson'::text AS region
   FROM (((public.watchlist w
     JOIN public.facilities f ON ((f.establishment_id = w.establishment_id)))
     LEFT JOIN LATERAL ( SELECT inspections.inspection_date,
            inspections.score,
            inspections.grade
           FROM public.inspections
          WHERE (inspections.establishment_id = w.establishment_id)
          ORDER BY inspections.inspection_date DESC, inspections.inspection_id DESC
         LIMIT 1) li ON (true))
     LEFT JOIN LATERAL ( SELECT
            count(*) FILTER (WHERE ("left"(lower(v.critical_yn), 1) = 'y'::text)) AS critical_6mo,
            count(*) AS violations_6mo
           FROM public.inspection_violations v
          WHERE ((v.establishment_id = w.establishment_id) AND (v.inspection_date > (CURRENT_DATE - '6 mons'::interval)))) c ON (true))
  WHERE (w.user_id = auth.uid())
UNION ALL
 SELECT w.id,
    w.user_id,
    w.establishment_id,
    e.name,
    e.address,
    e.city,
    NULL::date AS inspection_date,
    (round(r.score))::integer AS score,
    NULL::text AS grade,
    (0)::bigint AS critical_6mo,
    (COALESCE(cardinality(r.violations), 0))::bigint AS violations_6mo,
    'bullitt'::text AS region
   FROM ((public.watchlist w
     JOIN public.bullitt_establishments e ON ((e.id = w.establishment_id)))
     LEFT JOIN LATERAL ( SELECT i.score,
            i.violations
           FROM public.bullitt_inspections i
          WHERE ((i.establishment_id = e.id) AND (i.kind = 'routine'::text))
          ORDER BY i.last_seen DESC, i.first_seen DESC, i.id DESC
         LIMIT 1) r ON (true))
  WHERE (w.user_id = auth.uid());

GRANT ALL ON TABLE public.v_watchlist_with_latest TO authenticated;
GRANT ALL ON TABLE public.v_watchlist_with_latest TO service_role;

-- Watch areas ----------------------------------------------------------------------------
-- The return type changes (region), so the function has to be dropped and created again.
DROP FUNCTION IF EXISTS public.watch_zone_places(uuid);

CREATE FUNCTION public.watch_zone_places(p_area_id uuid)
RETURNS TABLE(
  establishment_id text,
  name text,
  address text,
  city text,
  lat double precision,
  lon double precision,
  distance_mi numeric,
  inspection_date date,
  score integer,
  grade text,
  critical_6mo integer, -- deprecated: no longer read by the site
  failing boolean,
  violations_6mo integer,
  region text
)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  with a as (
    select center_lat, center_lon, radius_miles
    from watchlist_areas
    where id = p_area_id
  ),
  -- Both counties' places in the circle's bounding box (cheap), then the exact distance.
  boxed as (
    select f.establishment_id, f.name, f.address, f.city, f.lat, f.lon, 'jefferson'::text as region
    from facilities f, a
    where f.lat is not null and f.lon is not null
      and f.lat between a.center_lat - a.radius_miles / 69.0 and a.center_lat + a.radius_miles / 69.0
      and f.lon between a.center_lon - a.radius_miles / 55.0 and a.center_lon + a.radius_miles / 55.0
    union all
    select e.id, e.name, e.address, e.city, e.lat, e.lon, 'bullitt'::text
    from bullitt_establishments e, a
    where e.active and e.lat is not null and e.lon is not null
      and e.lat between a.center_lat - a.radius_miles / 69.0 and a.center_lat + a.radius_miles / 69.0
      and e.lon between a.center_lon - a.radius_miles / 55.0 and a.center_lon + a.radius_miles / 55.0
  ),
  near as (
    select b.*,
      2 * 3958.8 * asin(sqrt(
        power(sin(radians(b.lat - a.center_lat) / 2), 2) +
        cos(radians(a.center_lat)) * cos(radians(b.lat)) *
        power(sin(radians(b.lon - a.center_lon) / 2), 2)
      )) as dist,
      a.radius_miles
    from boxed b cross join a
  ),
  latest as (
    -- Jefferson: the newest inspection and every violation in 6 months.
    select n.establishment_id, li.inspection_date, li.score, li.grade,
      coalesce(c.crit, 0)::int as crit, coalesce(c.cnt, 0)::int as cnt
    from near n
    left join lateral (
      select i.inspection_date, i.score, i.grade
      from inspections i
      where i.establishment_id = n.establishment_id
      order by i.inspection_date desc, i.inspection_id desc
      limit 1
    ) li on true
    left join lateral (
      select
        count(*) as cnt,
        count(*) filter (where left(lower(v.critical_yn::text), 1) = 'y') as crit
      from inspection_violations v
      where v.establishment_id = n.establishment_id
        and v.inspection_date > current_date - interval '6 months'
    ) c on true
    where n.region = 'jefferson' and n.dist <= n.radius_miles
    union all
    -- Bullitt: the current routine inspection (no date) and its violations.
    select n.establishment_id, null::date, round(r.score)::int, null::text,
      0, coalesce(cardinality(r.violations), 0)::int
    from near n
    left join lateral (
      select i.score, i.violations
      from bullitt_inspections i
      where i.establishment_id = n.establishment_id and i.kind = 'routine'
      order by i.last_seen desc, i.first_seen desc, i.id desc
      limit 1
    ) r on true
    where n.region = 'bullitt' and n.dist <= n.radius_miles
  )
  select
    n.establishment_id,
    n.name,
    n.address,
    n.city,
    n.lat,
    n.lon,
    round(n.dist::numeric, 2),
    l.inspection_date,
    l.score,
    l.grade,
    l.crit,
    (upper(coalesce(l.grade, '')) in ('C', 'F') or (l.score > 0 and l.score < 85)),
    l.cnt,
    n.region
  from near n
  join latest l on l.establishment_id = n.establishment_id
$$;

-- Signed-in users only, as before.
REVOKE ALL ON FUNCTION public.watch_zone_places(p_area_id uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.watch_zone_places(p_area_id uuid) FROM anon;
GRANT ALL ON FUNCTION public.watch_zone_places(p_area_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.watch_zone_places(p_area_id uuid) TO service_role;

-- Table View -----------------------------------------------------------------------------
-- Filters and ORDER BY ... LIMIT reach through UNION ALL, so Postgres still uses the
-- inspections indexes for Jefferson's part; Bullitt's part is a few hundred rows.
CREATE OR REPLACE VIEW public.v_table_inspections WITH (security_invoker = true) AS
 SELECT 'jefferson'::text AS region,
    i.inspection_id,
    i.establishment_id,
    i.inspection_date,
    i.score,
    i.grade,
    i.ins_type_desc,
    f.name,
    f.address,
    f.city,
    f.zip,
    f.facility_type,
    f.subtype
   FROM (public.inspections i
     LEFT JOIN public.facilities f USING (establishment_id))
UNION ALL
 SELECT 'bullitt'::text AS region,
    b.id AS inspection_id,
    b.establishment_id,
    b.inspection_date,
    (round(b.score))::integer AS score,
    NULL::text AS grade,
    CASE b.kind WHEN 'follow_up' THEN 'FOLLOWUP' ELSE 'REGULAR' END AS ins_type_desc,
    e.name,
    e.address,
    e.city,
    NULL::text AS zip,
    NULL::integer AS facility_type,
    NULL::integer AS subtype
   FROM (public.bullitt_inspections b
     JOIN public.bullitt_establishments e ON ((e.id = b.establishment_id)))
  WHERE e.active;

CREATE OR REPLACE VIEW public.v_table_latest WITH (security_invoker = true) AS
 SELECT * FROM (
   SELECT DISTINCT ON (i.establishment_id, i.ins_type_desc)
      'jefferson'::text AS region,
      i.inspection_id,
      i.establishment_id,
      i.inspection_date,
      i.score,
      i.grade,
      i.ins_type_desc,
      f.name,
      f.address,
      f.city,
      f.zip,
      f.facility_type,
      f.subtype
     FROM (public.inspections i
       LEFT JOIN public.facilities f USING (establishment_id))
    WHERE (i.ins_type_desc IS NOT NULL)
    ORDER BY i.establishment_id, i.ins_type_desc, i.inspection_date DESC, i.inspection_id DESC
 ) jefferson
UNION ALL
 SELECT * FROM (
   -- The current routine inspection, and the follow-up still on the sheet (as the map).
   SELECT DISTINCT ON (b.establishment_id, b.kind)
      'bullitt'::text AS region,
      b.id AS inspection_id,
      b.establishment_id,
      b.inspection_date,
      (round(b.score))::integer AS score,
      NULL::text AS grade,
      CASE b.kind WHEN 'follow_up' THEN 'FOLLOWUP' ELSE 'REGULAR' END AS ins_type_desc,
      e.name,
      e.address,
      e.city,
      NULL::text AS zip,
      NULL::integer AS facility_type,
      NULL::integer AS subtype
     FROM (public.bullitt_inspections b
       JOIN public.bullitt_establishments e ON ((e.id = b.establishment_id)))
    WHERE e.active AND (b.kind = 'routine' OR b.last_seen >= e.last_seen)
    ORDER BY b.establishment_id, b.kind, b.last_seen DESC, b.first_seen DESC, b.id DESC
 ) bullitt;

GRANT SELECT ON public.v_table_inspections, public.v_table_latest TO anon, authenticated;
GRANT ALL ON public.v_table_inspections, public.v_table_latest TO service_role;
