-- Bullitt County: what the map needs to estimate an undated inspection's date
-- (branch feat/bullitt-county, after 20261110000000_bullitt_county.sql).
--
-- The department publishes no date for a place's latest routine inspection. This site
-- loads the sheet daily, so a result that first appeared after the first load was posted
-- that day, and the inspection was on or before it. The website shows such a date as
-- "By <date>" with a disclaimer (apps/web/src/lib/bullitt.js). Results that were already
-- on the sheet at the first load can't be dated.
--
-- Adds two columns at the end of v_bullitt_map_feed: when the current routine result was
-- first seen (routine_first_seen), and the day of the first load (tracking_since).
-- Only replaces the view. Safe to run more than once.

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
  r.first_seen AS routine_first_seen,
  t.tracking_since
FROM public.bullitt_establishments e
CROSS JOIN (SELECT min(first_seen) AS tracking_since FROM public.bullitt_establishments) t
LEFT JOIN LATERAL (
  SELECT i.score, i.violations, i.first_seen
  FROM public.bullitt_inspections i
  WHERE i.establishment_id = e.id AND i.kind = 'routine'
  ORDER BY i.last_seen DESC, i.first_seen DESC, i.id DESC
  LIMIT 1
) r ON true
LEFT JOIN LATERAL (
  SELECT i.inspection_date, i.score
  FROM public.bullitt_inspections i
  WHERE i.establishment_id = e.id AND i.kind = 'follow_up' AND i.last_seen >= e.last_seen
  ORDER BY i.id DESC
  LIMIT 1
) f ON true
WHERE e.active AND e.lon IS NOT NULL AND e.lat IS NOT NULL;

GRANT SELECT ON public.v_bullitt_map_feed TO anon, authenticated;
