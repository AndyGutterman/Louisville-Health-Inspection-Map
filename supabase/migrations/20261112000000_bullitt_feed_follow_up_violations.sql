-- The Bullitt map feed gains follow_up_violation_count: how many violations the
-- follow-up currently on the sheet lists.
--
-- The violation ring on a pin means "violations on the latest record" in both counties.
-- For a Bullitt place with a follow-up, that record is the follow-up, and until now the
-- feed only had its score, so the site used "below 100" as a stand-in. With the count,
-- the rule is the same as Louisville's: the ring shows when violations are listed.
--
-- CREATE OR REPLACE VIEW may add columns at the end, so no drop is needed. The site reads
-- the feed with select=*, so it works before and after this runs. Safe to run more than once.

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
    AS follow_up_violation_count
FROM public.bullitt_establishments e
LEFT JOIN LATERAL (
  SELECT i.score, i.violations
  FROM public.bullitt_inspections i
  WHERE i.establishment_id = e.id AND i.kind = 'routine'
  ORDER BY i.last_seen DESC, i.first_seen DESC, i.id DESC
  LIMIT 1
) r ON true
LEFT JOIN LATERAL (
  SELECT i.id, i.inspection_date, i.score, i.violations
  FROM public.bullitt_inspections i
  WHERE i.establishment_id = e.id AND i.kind = 'follow_up' AND i.last_seen >= e.last_seen
  ORDER BY i.id DESC
  LIMIT 1
) f ON true
WHERE e.active AND e.lon IS NOT NULL AND e.lat IS NOT NULL;

GRANT SELECT ON public.v_bullitt_map_feed TO anon, authenticated;
