-- Fix: return the score at the time of the violation (not current score)
-- and the actual date the violation occurred.
-- The old version returned v_facility_map_feed.score_recent (current score),
-- which caused confusion — e.g. a restaurant now scoring 100 appeared next to a
-- "Food stored covered" violation that was from a past inspection.

CREATE OR REPLACE FUNCTION public.get_establishments_for_violation(
  p_violation_desc text,
  p_since_date     text DEFAULT NULL
)
RETURNS TABLE(
  establishment_id  text,
  premise_name      text,
  address           text,
  violation_date    date,
  violation_score   integer,
  score_recent      integer   -- still returned for reference, but violation_date + violation_score are the meaningful fields
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT DISTINCT ON (iv.establishment_id)
    iv.establishment_id,
    f.name               AS premise_name,
    f.address,
    iv.inspection_date   AS violation_date,
    insp.score           AS violation_score,
    feed.score_recent
  FROM public.inspection_violations iv
  JOIN public.facilities f
    ON f.establishment_id = iv.establishment_id
  LEFT JOIN public.inspections insp
    ON insp.inspection_id = iv.inspection_id
  LEFT JOIN public.v_facility_map_feed feed
    ON feed.establishment_id = iv.establishment_id
  WHERE
    iv.violation_desc = p_violation_desc
    AND (p_since_date IS NULL OR iv.inspection_date >= p_since_date::date)
  ORDER BY iv.establishment_id, iv.inspection_date DESC
  LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION public.get_establishments_for_violation(text, text) TO anon, authenticated;
