-- get_whats_new(limit_n integer)
-- Returns recent inspections, prioritizing low scores and those with critical
-- violations. Used by the What's New panel in Map.jsx.

CREATE OR REPLACE FUNCTION public.get_whats_new(limit_n integer DEFAULT 20)
RETURNS TABLE(
  establishment_id  text,
  premise_name      text,
  address           text,
  score             integer,
  grade             text,
  inspection_date   date,
  critical_count    bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
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
      COUNT(CASE WHEN iv.critical_yn ILIKE 'y%' THEN 1 END) AS critical_count
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
    critical_count
  FROM recent
  ORDER BY
    CASE WHEN score < 85 OR critical_count > 0 THEN 0 ELSE 1 END,
    inspection_date DESC
  LIMIT limit_n;
$$;

GRANT EXECUTE ON FUNCTION public.get_whats_new(integer) TO anon, authenticated;
