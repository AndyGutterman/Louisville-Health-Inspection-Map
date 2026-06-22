-- get_violation_flags()
-- Returns one row per establishment: whether their most recent inspection
-- had critical (priority) violations and/or any violations at all.
-- Used by the map to draw amber/blue rings on pins.

CREATE OR REPLACE FUNCTION public.get_violation_flags()
RETURNS TABLE(
  establishment_id text,
  has_critical     boolean,
  has_any          boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    latest.establishment_id,
    COALESCE(bool_or(iv.critical_yn ILIKE 'y%'), false) AS has_critical,
    COALESCE(COUNT(iv.violation_oid) > 0, false)        AS has_any
  FROM (
    -- Most recent inspection per establishment
    SELECT DISTINCT ON (establishment_id)
      establishment_id,
      inspection_id
    FROM public.inspections
    ORDER BY establishment_id, inspection_date DESC, inspection_id DESC
  ) latest
  LEFT JOIN public.inspection_violations iv
    ON iv.inspection_id = latest.inspection_id
  GROUP BY latest.establishment_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_violation_flags() TO anon, authenticated;
