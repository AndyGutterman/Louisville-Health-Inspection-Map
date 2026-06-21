-- get_violation_summary(since_date text)
-- Returns violation descriptions + severity + count, sorted by frequency.
-- Replaces the paginated client-side loop in LearnPage ViolationDatabase.
-- since_date: ISO date string 'YYYY-MM-DD', or NULL for all-time.

CREATE OR REPLACE FUNCTION public.get_violation_summary(since_date text DEFAULT NULL)
RETURNS TABLE(
  violation_desc text,
  critical_yn    text,
  cnt            bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    iv.violation_desc,
    iv.critical_yn,
    COUNT(*) AS cnt
  FROM public.inspection_violations iv
  WHERE
    iv.violation_desc IS NOT NULL
    AND (since_date IS NULL OR iv.inspection_date >= since_date::date)
  GROUP BY iv.violation_desc, iv.critical_yn
  ORDER BY cnt DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_violation_summary(text) TO anon, authenticated;


-- get_establishments_for_violation(p_violation_desc text, p_since_date text)
-- Returns up to 50 establishments that currently have a given violation.
-- Used by the violation drill-down panel in LearnPage.

CREATE OR REPLACE FUNCTION public.get_establishments_for_violation(
  p_violation_desc text,
  p_since_date     text DEFAULT NULL
)
RETURNS TABLE(
  establishment_id      text,
  premise_name          text,
  address               text,
  score_recent          integer,
  inspection_date_recent date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT DISTINCT ON (iv.establishment_id)
    iv.establishment_id,
    f.name               AS premise_name,
    f.address,
    feed.score_recent,
    feed.inspection_date_recent
  FROM public.inspection_violations iv
  JOIN public.facilities f
    ON f.establishment_id = iv.establishment_id
  LEFT JOIN public.v_facility_map_feed feed
    ON feed.establishment_id = iv.establishment_id
  WHERE
    iv.violation_desc = p_violation_desc
    AND (p_since_date IS NULL OR iv.inspection_date >= p_since_date::date)
  ORDER BY iv.establishment_id, iv.inspection_date DESC
  LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION public.get_establishments_for_violation(text, text) TO anon, authenticated;
