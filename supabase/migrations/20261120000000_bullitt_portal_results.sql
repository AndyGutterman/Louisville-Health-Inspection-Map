-- Bullitt County's results come from Kentucky's inspection portal while it is answering,
-- and from the county's sheet otherwise (docs/COUNTIES.md, "If the portal goes away").
--
-- The portal has the same 250 places with the same ids as the sheet, every result dated,
-- and posts sooner. pipeline/regions/kyportal loads it into portal_inspections (region
-- 'bullitt'); the sheet import keeps loading bullitt_inspections as before.
--
--   bullitt_results   NEW: the portal's Bullitt results when portal_regions says the
--                     portal answered for Bullitt in the last 3 days (one missed daily run
--                     is fine), otherwise the sheet's. Same columns as bullitt_inspections,
--                     plus source ('portal' | 'sheet'), current (on the place's latest
--                     load) and latest_version (no newer row for the same kind and date,
--                     e.g. a follow-up whose score was posted later).
--   Every Bullitt reader now reads bullitt_results: the map feed (+ routine_date), What's
--   New, Top Scores, Table View, saved places and watch areas, which now get a date
--   whenever the result has one. Places, pins and saved places stay on
--   bullitt_establishments, so nothing a visitor saved changes.
--
-- Needs 20261119000000_portal_counties.sql first. Until the portal job has run for
-- Bullitt, everything reads the sheet exactly as before. Safe to run more than once.

CREATE OR REPLACE VIEW public.bullitt_results WITH (security_invoker = true) AS
WITH portal AS (
  SELECT EXISTS (
    SELECT 1 FROM public.portal_regions
    WHERE region = 'bullitt' AND last_checked_at > now() - interval '3 days'
  ) AS fresh
),
picked AS (
  SELECT p.id, p.establishment_id, p.kind, p.inspection_date, p.score, p.violations,
         p.content_hash, p.first_seen, p.last_seen, 'portal'::text AS source
  FROM public.portal_inspections p, portal
  WHERE portal.fresh AND p.region = 'bullitt'
  UNION ALL
  SELECT b.id, b.establishment_id, b.kind, b.inspection_date, b.score, b.violations,
         b.content_hash, b.first_seen, b.last_seen, 'sheet'::text
  FROM public.bullitt_inspections b, portal
  WHERE NOT portal.fresh
)
SELECT r.*,
  r.last_seen = max(r.last_seen) OVER (PARTITION BY r.establishment_id) AS current,
  (r.inspection_date IS NULL
   OR row_number() OVER (
        PARTITION BY r.establishment_id, r.kind, r.inspection_date
        ORDER BY r.last_seen DESC, r.id DESC) = 1) AS latest_version
FROM picked r;

GRANT SELECT ON public.bullitt_results TO anon, authenticated;

-- Map feed ----------------------------------------------------------------------------
-- As 20261113000000, reading bullitt_results, plus routine_date at the end (CREATE OR
-- REPLACE VIEW may add columns there). The site reads it with select=*.
CREATE OR REPLACE VIEW public.v_bullitt_map_feed WITH (security_invoker = true) AS
SELECT
  e.id AS establishment_id,
  e.name AS premise_name,
  e.address,
  e.city,
  e.lon,
  e.lat,
  r.score AS score_recent,
  COALESCE(cardinality(r.violations), 0) AS violation_count_recent,
  f.inspection_date AS follow_up_date,
  f.score AS follow_up_score,
  CASE WHEN f.id IS NOT NULL THEN COALESCE(cardinality(f.violations), 0) END
    AS follow_up_violation_count,
  r.first_seen AS routine_first_seen,
  t.tracking_since,
  r.inspection_date AS routine_date
FROM public.bullitt_establishments e
CROSS JOIN (SELECT min(first_seen) AS tracking_since FROM public.bullitt_establishments) t
LEFT JOIN LATERAL (
  SELECT i.score, i.violations, i.first_seen, i.inspection_date
  FROM public.bullitt_results i
  WHERE i.establishment_id = e.id AND i.kind = 'routine'
  ORDER BY i.last_seen DESC, i.inspection_date DESC NULLS LAST, i.first_seen DESC, i.id DESC
  LIMIT 1
) r ON true
LEFT JOIN LATERAL (
  SELECT i.id, i.inspection_date, i.score, i.violations
  FROM public.bullitt_results i
  WHERE i.establishment_id = e.id AND i.kind = 'follow_up' AND i.current
  ORDER BY i.inspection_date DESC NULLS LAST, i.id DESC
  LIMIT 1
) f ON true
WHERE e.active AND e.lon IS NOT NULL AND e.lat IS NOT NULL;

GRANT SELECT ON public.v_bullitt_map_feed TO anon, authenticated;

-- What's New --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_whats_new(limit_n integer DEFAULT 20)
RETURNS TABLE(
  establishment_id text,
  premise_name text,
  address text,
  score integer,
  grade text,
  inspection_date date,
  critical_count bigint, -- deprecated: no longer read by the site
  violation_count bigint,
  region text,
  posted_date date       -- undated Bullitt rows: when the sheet changed
)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH jefferson AS (
    SELECT
      i.establishment_id,
      f.name            AS premise_name,
      f.address,
      i.score,
      i.grade,
      i.inspection_date,
      COUNT(CASE WHEN iv.critical_yn ILIKE 'y%' THEN 1 END) AS critical_count,
      COUNT(iv.violation_oid)                                AS violation_count,
      'jefferson'::text AS region,
      NULL::date        AS posted_date
    FROM inspections i
    JOIN facilities f ON f.establishment_id = i.establishment_id
    LEFT JOIN inspection_violations iv ON iv.inspection_id = i.inspection_id
    WHERE i.inspection_date >= (CURRENT_DATE - INTERVAL '30 days')
      AND f.active = true
    GROUP BY i.inspection_id, i.establishment_id, f.name, f.address, i.score, i.grade, i.inspection_date
  ),
  first_load AS (
    SELECT min(first_seen) AS d FROM bullitt_establishments
  ),
  bullitt AS (
    SELECT
      b.establishment_id,
      e.name,
      e.address,
      round(b.score)::integer,
      NULL::text,
      b.inspection_date,
      0::bigint,
      cardinality(b.violations)::bigint,
      'bullitt'::text,
      CASE WHEN b.inspection_date IS NULL THEN b.first_seen END
    FROM bullitt_results b
    JOIN bullitt_establishments e ON e.id = b.establishment_id
    CROSS JOIN first_load
    WHERE e.active
      AND (
        -- dated (every portal result, and the sheet's follow-ups): by inspection date
        (b.inspection_date >= CURRENT_DATE - INTERVAL '30 days' AND b.latest_version)
        -- the sheet's undated routine results: by the day they appeared
        OR (b.inspection_date IS NULL AND b.kind = 'routine'
            AND b.first_seen >= CURRENT_DATE - INTERVAL '30 days'
            AND b.first_seen > first_load.d
            AND b.current)
      )
  ),
  recent AS (
    SELECT * FROM jefferson
    UNION ALL
    SELECT * FROM bullitt
  )
  SELECT
    establishment_id,
    premise_name,
    address,
    score,
    grade,
    inspection_date,
    critical_count,
    violation_count,
    region,
    posted_date
  FROM recent
  ORDER BY
    CASE WHEN upper(coalesce(grade, '')) = 'C' OR score < 85 THEN 0 ELSE 1 END,
    coalesce(inspection_date, posted_date) DESC
  LIMIT limit_n;
$$;

GRANT ALL ON FUNCTION public.get_whats_new(limit_n integer) TO anon;
GRANT ALL ON FUNCTION public.get_whats_new(limit_n integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_whats_new(limit_n integer) TO service_role;

-- Top Scores --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_top_scores(limit_n integer DEFAULT 20)
RETURNS TABLE(
  establishment_id text,
  premise_name text,
  address text,
  score integer,
  inspection_date date,
  region text,
  posted_date date
)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT * FROM ((
    SELECT m.establishment_id, m.premise_name, m.address, 100 AS score,
           m.inspection_date_recent AS inspection_date, 'jefferson'::text AS region,
           NULL::date AS posted_date
    FROM v_facility_map_feed m
    WHERE m.score_recent = 100
    ORDER BY m.inspection_date_recent DESC
    LIMIT limit_n
  )
  UNION ALL
  (
    -- Bullitt: a current, dated 100 (every portal result, the sheet's follow-ups), or
    -- one of the sheet's undated routine 100s posted after its first load.
    SELECT b.establishment_id, e.name, e.address, 100, b.inspection_date, 'bullitt'::text,
           CASE WHEN b.inspection_date IS NULL THEN b.first_seen END
    FROM bullitt_results b
    JOIN bullitt_establishments e ON e.id = b.establishment_id
    WHERE e.active AND b.score = 100 AND b.current
      AND (b.inspection_date IS NOT NULL
           OR b.first_seen > (SELECT min(first_seen) FROM bullitt_establishments))
    ORDER BY coalesce(b.inspection_date, b.first_seen) DESC
    LIMIT limit_n
  )) top
  ORDER BY coalesce(top.inspection_date, top.posted_date) DESC NULLS LAST
  LIMIT limit_n;
$$;

GRANT ALL ON FUNCTION public.get_top_scores(limit_n integer) TO anon;
GRANT ALL ON FUNCTION public.get_top_scores(limit_n integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_top_scores(limit_n integer) TO service_role;

-- Saved places ------------------------------------------------------------------------
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
    r.inspection_date,
    (round(r.score))::integer AS score,
    NULL::text AS grade,
    (0)::bigint AS critical_6mo,
    (COALESCE(cardinality(r.violations), 0))::bigint AS violations_6mo,
    'bullitt'::text AS region
   FROM ((public.watchlist w
     JOIN public.bullitt_establishments e ON ((e.id = w.establishment_id)))
     LEFT JOIN LATERAL ( SELECT i.score,
            i.violations,
            i.inspection_date
           FROM public.bullitt_results i
          WHERE ((i.establishment_id = e.id) AND (i.kind = 'routine'::text))
          ORDER BY i.last_seen DESC, i.inspection_date DESC NULLS LAST, i.first_seen DESC, i.id DESC
         LIMIT 1) r ON (true))
  WHERE (w.user_id = auth.uid());

GRANT ALL ON TABLE public.v_watchlist_with_latest TO authenticated;
GRANT ALL ON TABLE public.v_watchlist_with_latest TO service_role;

-- Watch areas -------------------------------------------------------------------------
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
    -- Bullitt: the current routine inspection (dated when it came from the portal) and
    -- its violations.
    select n.establishment_id, r.inspection_date, round(r.score)::int, null::text,
      0, coalesce(cardinality(r.violations), 0)::int
    from near n
    left join lateral (
      select i.score, i.violations, i.inspection_date
      from bullitt_results i
      where i.establishment_id = n.establishment_id and i.kind = 'routine'
      order by i.last_seen desc, i.inspection_date desc nulls last, i.first_seen desc, i.id desc
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

-- Table View --------------------------------------------------------------------------
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
   FROM (public.bullitt_results b
     JOIN public.bullitt_establishments e ON ((e.id = b.establishment_id)))
  WHERE e.active AND b.latest_version;

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
   -- The current routine inspection, and the follow-up still listed (as the map).
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
     FROM (public.bullitt_results b
       JOIN public.bullitt_establishments e ON ((e.id = b.establishment_id)))
    WHERE e.active AND (b.kind = 'routine' OR b.current)
    ORDER BY b.establishment_id, b.kind, b.last_seen DESC, b.inspection_date DESC NULLS LAST,
      b.first_seen DESC, b.id DESC
 ) bullitt;

GRANT SELECT ON public.v_table_inspections, public.v_table_latest TO anon, authenticated;
GRANT ALL ON public.v_table_inspections, public.v_table_latest TO service_role;
