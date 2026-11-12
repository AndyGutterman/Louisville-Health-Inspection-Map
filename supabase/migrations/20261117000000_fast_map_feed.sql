-- The map feed looks up each place's latest inspection by index instead of ranking
-- every inspection on every request.
--
-- Why: v_facility_map_feed joined v_latest_inspection, which runs row_number() over the
-- whole inspections table (dragging the raw jsonb column along) and keeps rank 1. The site
-- reads the feed in pages of 1,000, so that full ranking ran once per page, and later
-- pages got slower (measured 2026-11-10: 0.9 s, 1.2, 1.7, 2.2, 2.7, 2.8 s). The anon role's
-- statement timeout is about 3 s; past it a page fails with 57014, the map is never
-- drawn, and visitors see a grey screen after the splash.
--
-- Now: one LATERAL lookup per place on inspections_est_idx (establishment_id,
-- inspection_date DESC). Same columns, same order, same rows, same tie-break as
-- v_latest_inspection (newest date, then highest score, then highest inspection id;
-- scored, non-survey inspections only). v_latest_inspection itself is unchanged.
--
-- CREATE OR REPLACE keeps the grants. Safe to run more than once.

CREATE OR REPLACE VIEW public.v_facility_map_feed WITH (security_invoker = true) AS
SELECT
  f.establishment_id,
  f.name AS premise_name,
  f.address,
  f.lon,
  f.lat,
  li.inspection_date AS inspection_date_recent,
  li.score AS score_recent,
  li.grade AS grade_recent
FROM public.facilities f
LEFT JOIN LATERAL (
  SELECT i.inspection_date, i.score, i.grade
  FROM public.inspections i
  WHERE i.establishment_id = f.establishment_id
    AND COALESCE(i.score, 0) > 0
    AND COALESCE(i.ins_type_desc, '') NOT ILIKE '%survey%'
  ORDER BY i.inspection_date DESC, i.score DESC, i.inspection_id DESC
  LIMIT 1
) li ON true
WHERE f.lon IS NOT NULL AND f.lat IS NOT NULL;

-- Check, before and after (the "Execution Time" line at the bottom; expect well under
-- 100 ms after, from over 1 s before):
--
--   EXPLAIN (ANALYZE, BUFFERS)
--   SELECT * FROM public.v_facility_map_feed
--   ORDER BY establishment_id OFFSET 5000 LIMIT 1000;
--
-- Same rows as before (should return 0):
--
--   SELECT establishment_id, inspection_date_recent, score_recent, grade_recent
--   FROM public.v_facility_map_feed
--   EXCEPT
--   SELECT f.establishment_id, li.inspection_date, li.score, li.grade
--   FROM public.facilities f
--   LEFT JOIN public.v_latest_inspection li USING (establishment_id)
--   WHERE f.lon IS NOT NULL AND f.lat IS NOT NULL;
