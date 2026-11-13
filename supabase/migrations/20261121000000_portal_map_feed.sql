-- Oldham County on the map (docs/COUNTIES.md, "What's next"): one pin per place, from the
-- portal tables pipeline/regions/kyportal loads daily (20261119000000_portal_counties.sql).
--
--   v_portal_map_feed   NEW: like v_bullitt_map_feed, plus region. The site reads it with
--                       select=* and region=in.(<the counties it lists>), so a county
--                       loaded into the portal tables shows only once the site lists it
--                       (apps/web/src/lib/regions.js, feed: "portal").
--
-- Bullitt is left out: it is on the portal too, but its pins come from
-- bullitt_establishments (v_bullitt_map_feed), whose results already switch between the
-- portal and the county's sheet (20261120000000).
--
-- The drawer reads portal_inspections, which anon can already read. What's New, Top
-- Scores, Table View, saved places and watch areas don't include Oldham yet.
--
-- "Current" results are those on the place's latest load (last_seen). The portal can
-- list several results for one place on one day, one per kind of inspection (a school's
-- kitchen and its playground), without saying which is which: the pin shows the lowest
-- score of the newest day. The drawer lists them all, in the same order
-- (apps/web/src/lib/portal.js).
--
-- Only adds a view. Safe to run more than once.

CREATE OR REPLACE VIEW public.v_portal_map_feed WITH (security_invoker = true) AS
SELECT
  e.id AS establishment_id,
  e.region,
  e.name AS premise_name,
  e.address,
  e.city,
  e.lon,
  e.lat,
  r.score AS score_recent,
  COALESCE(cardinality(r.violations), 0) AS violation_count_recent,
  r.inspection_date AS routine_date,
  f.inspection_date AS follow_up_date,
  f.score AS follow_up_score,
  CASE WHEN f.id IS NOT NULL THEN COALESCE(cardinality(f.violations), 0) END
    AS follow_up_violation_count
FROM public.portal_establishments e
LEFT JOIN LATERAL (
  SELECT max(i.last_seen) AS d
  FROM public.portal_inspections i
  WHERE i.establishment_id = e.id
) latest ON true
LEFT JOIN LATERAL (
  SELECT i.score, i.violations, i.inspection_date
  FROM public.portal_inspections i
  WHERE i.establishment_id = e.id AND i.kind = 'routine' AND i.last_seen = latest.d
  ORDER BY i.inspection_date DESC NULLS LAST, i.score ASC NULLS LAST, i.id DESC
  LIMIT 1
) r ON true
LEFT JOIN LATERAL (
  SELECT i.id, i.inspection_date, i.score, i.violations
  FROM public.portal_inspections i
  WHERE i.establishment_id = e.id AND i.kind = 'follow_up' AND i.last_seen = latest.d
    AND i.score IS NOT NULL -- a follow-up with no score yet doesn't decide the pin
  ORDER BY i.inspection_date DESC NULLS LAST, i.score ASC NULLS LAST, i.id DESC
  LIMIT 1
) f ON true
WHERE e.active
  AND e.region <> 'bullitt'
  AND e.lon IS NOT NULL
  AND e.lat IS NOT NULL;

GRANT SELECT ON public.v_portal_map_feed TO anon, authenticated;
