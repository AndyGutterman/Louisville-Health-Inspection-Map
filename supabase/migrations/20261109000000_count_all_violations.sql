-- Count every violation, and stop deciding anything from the yes/no "critical" flag.
--
-- Louisville's data marks each violation with critical_yn, but Kentucky's Food Code
-- (2013 FDA Food Code, since 2019) has three kinds of violation, and the flag can't tell
-- them apart. The site now treats every citation as a violation, so:
--
--   get_whats_new         + violation_count (all violations on that inspection);
--                           failing first = grade C or score below 85, not "has critical".
--   watch_zone_places     + violations_6mo (all violations in 6 months);
--                           failing = grade C/F or score 1-84, not "has critical".
--   v_watchlist_with_latest + violations_6mo.
--
-- The old critical_count / critical_6mo columns stay, so the site that is live before
-- this change still works. They can be dropped once nothing reads them.
-- Safe to run more than once.

-- What's New -------------------------------------------------------------------------
-- The return type changes, so the function has to be dropped and created again.
DROP FUNCTION IF EXISTS public.get_whats_new(integer);

CREATE FUNCTION public.get_whats_new(limit_n integer DEFAULT 20)
RETURNS TABLE(
  establishment_id text,
  premise_name text,
  address text,
  score integer,
  grade text,
  inspection_date date,
  critical_count bigint, -- deprecated: no longer read by the site
  violation_count bigint
)
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  WITH recent AS (
    SELECT
      i.inspection_id,
      i.establishment_id,
      f.name            AS premise_name,
      f.address,
      i.score,
      i.grade,
      i.inspection_date,
      COUNT(CASE WHEN iv.critical_yn ILIKE 'y%' THEN 1 END) AS critical_count,
      COUNT(iv.violation_oid)                                AS violation_count
    FROM public.inspections i
    JOIN public.facilities f ON f.establishment_id = i.establishment_id
    LEFT JOIN public.inspection_violations iv ON iv.inspection_id = i.inspection_id
    WHERE i.inspection_date >= (CURRENT_DATE - INTERVAL '30 days')
      AND f.active = true
    GROUP BY i.inspection_id, i.establishment_id, f.name, f.address, i.score, i.grade, i.inspection_date
  )
  SELECT
    establishment_id,
    premise_name,
    address,
    score,
    grade,
    inspection_date,
    critical_count,
    violation_count
  FROM recent
  ORDER BY
    CASE WHEN upper(coalesce(grade, '')) = 'C' OR score < 85 THEN 0 ELSE 1 END,
    inspection_date DESC
  LIMIT limit_n;
$$;

GRANT ALL ON FUNCTION public.get_whats_new(limit_n integer) TO anon;
GRANT ALL ON FUNCTION public.get_whats_new(limit_n integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_whats_new(limit_n integer) TO service_role;

-- Watch areas (Saved) ------------------------------------------------------------------
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
  violations_6mo integer
)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  with a as (
    select center_lat, center_lon, radius_miles
    from watchlist_areas
    where id = p_area_id
  ),
  near as (
    select
      f.establishment_id, f.name, f.address, f.city, f.lat, f.lon,
      2 * 3958.8 * asin(sqrt(
        power(sin(radians(f.lat - a.center_lat) / 2), 2) +
        cos(radians(a.center_lat)) * cos(radians(f.lat)) *
        power(sin(radians(f.lon - a.center_lon) / 2), 2)
      )) as dist,
      a.radius_miles
    from facilities f
    cross join a
    where f.lat is not null and f.lon is not null
      and f.lat between a.center_lat - a.radius_miles / 69.0 and a.center_lat + a.radius_miles / 69.0
      and f.lon between a.center_lon - a.radius_miles / 55.0 and a.center_lon + a.radius_miles / 55.0
  )
  select
    n.establishment_id,
    n.name,
    n.address,
    n.city,
    n.lat,
    n.lon,
    round(n.dist::numeric, 2),
    li.inspection_date,
    li.score,
    li.grade,
    coalesce(c.crit, 0)::int,
    (upper(coalesce(li.grade, '')) in ('C', 'F') or (li.score > 0 and li.score < 85)),
    coalesce(c.cnt, 0)::int
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
  where n.dist <= n.radius_miles
$$;

-- Signed-in users only, as before. (Supabase's default privileges would otherwise give
-- the new function to anon too.)
REVOKE ALL ON FUNCTION public.watch_zone_places(p_area_id uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.watch_zone_places(p_area_id uuid) FROM anon;
GRANT ALL ON FUNCTION public.watch_zone_places(p_area_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.watch_zone_places(p_area_id uuid) TO service_role;

-- Saved places ---------------------------------------------------------------------------
-- CREATE OR REPLACE VIEW may add columns at the end, so no drop is needed.
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
    COALESCE(c.violations_6mo, (0)::bigint) AS violations_6mo
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
  WHERE (w.user_id = auth.uid());

GRANT ALL ON TABLE public.v_watchlist_with_latest TO authenticated;
GRANT ALL ON TABLE public.v_watchlist_with_latest TO service_role;
