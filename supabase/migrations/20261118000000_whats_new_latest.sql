-- What's New "Latest" tab (apps/web/src/WhatsNew.jsx): the newest inspections in both
-- counties, whatever they scored. The same rows as get_whats_new (last 30 days, the same
-- Bullitt rules), only ordered by date instead of failing-first, so the two tabs can't
-- disagree about which inspections exist. Undated Bullitt rows sort by the day they were
-- posted, as the panel labels them. Safe to run twice.

CREATE OR REPLACE FUNCTION public.get_latest_inspections(limit_n integer DEFAULT 20)
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
  posted_date date
)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT w.*
  FROM get_whats_new(100000) w
  ORDER BY coalesce(w.inspection_date, w.posted_date) DESC NULLS LAST, w.premise_name
  LIMIT limit_n;
$$;

GRANT ALL ON FUNCTION public.get_latest_inspections(limit_n integer) TO anon;
GRANT ALL ON FUNCTION public.get_latest_inspections(limit_n integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_latest_inspections(limit_n integer) TO service_role;
