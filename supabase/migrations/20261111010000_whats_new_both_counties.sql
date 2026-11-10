-- What's New covers Bullitt County too.
--
-- Bullitt's sheet (docs/BULLITT.md) has no date for the routine inspection, so "new" for
-- Bullitt means:
--   * a follow-up whose date is in the last 30 days, or
--   * a routine score that changed on the sheet in the last 30 days (first_seen), not
--     counting the very first load, when every place was "new" to this site.
-- Those routine rows return inspection_date NULL and posted_date = the day the pipeline
-- saw the change; the site labels them "posted", never as an inspection date.
--
--   get_whats_new   + region, + posted_date; Bullitt rows mixed in, same ordering
--                     (failing first, then newest by inspection or posted date).
--   get_top_scores  NEW: the latest perfect 100s from both counties (What's New's Top
--                     Scores tab, which read v_facility_map_feed directly before).
--
-- Needs 20261110000000_bullitt_county.sql first. Safe to run more than once.

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
  violation_count bigint,
  region text,
  posted_date date       -- Bullitt routine rows: when the sheet changed (no inspection date)
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
      CASE WHEN b.kind = 'routine' THEN b.first_seen END
    FROM bullitt_inspections b
    JOIN bullitt_establishments e ON e.id = b.establishment_id
    CROSS JOIN first_load
    WHERE e.active
      AND (
        (b.kind = 'follow_up' AND b.inspection_date >= CURRENT_DATE - INTERVAL '30 days')
        OR (b.kind = 'routine'
            AND b.first_seen >= CURRENT_DATE - INTERVAL '30 days'
            AND b.first_seen > first_load.d
            AND b.last_seen >= e.last_seen)  -- still the current version
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

-- Top Scores ------------------------------------------------------------------------------
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
    -- Bullitt: a dated follow-up of 100, or a routine 100 posted after the first load.
    SELECT b.establishment_id, e.name, e.address, 100, b.inspection_date, 'bullitt'::text,
           CASE WHEN b.kind = 'routine' THEN b.first_seen END
    FROM bullitt_inspections b
    JOIN bullitt_establishments e ON e.id = b.establishment_id
    WHERE e.active AND b.score = 100 AND b.last_seen >= e.last_seen
      AND (b.kind = 'follow_up'
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
