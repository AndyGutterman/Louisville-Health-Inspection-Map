-- Jefferson's map pins in one read instead of three.
--
-- Why: a fresh load of the map read three things, each in pages of 1,000 (about 9 pages
-- each, 27 requests): v_facility_map_feed (the pins), facilities (type, subtype, city,
-- state, zip) and get_violation_flags() (the ring). The same establishment ids crossed
-- the wire three times and the address twice, and get_violation_flags ranked every
-- inspection in the table again for each of its 9 pages. If that function timed out, the
-- site didn't keep the pins in the browser, so the next visit downloaded everything again.
--
-- Now: v_facility_map_pins has every column a pin needs, so the site reads 9 pages, not
-- 27, and about a third fewer bytes. The ring is looked up per place by index
-- (inspections_est_idx, idx_insp_viol_by_inspid), like the latest score.
--
--   has_any_violation   the place's latest inspection (any type, newest date, then highest
--                       inspection id) has at least one violation: the same rule as
--                       get_violation_flags().has_any.
--
-- Only adds a view. The site uses it when it exists and falls back to the three reads
-- when it doesn't (apps/web/src/api/mapData.js), so this can be run before or after the
-- site is deployed. v_facility_map_feed, facilities and get_violation_flags are unchanged.
-- Safe to run more than once.

CREATE OR REPLACE VIEW public.v_facility_map_pins WITH (security_invoker = true) AS
SELECT
  f.establishment_id,
  f.name AS premise_name,
  f.address,
  f.city,
  f.state,
  f.zip,
  f.facility_type,
  f.subtype,
  f.lon,
  f.lat,
  li.inspection_date AS inspection_date_recent,
  li.score AS score_recent,
  li.grade AS grade_recent,
  COALESCE(v.has_any, false) AS has_any_violation
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
LEFT JOIN LATERAL (
  SELECT EXISTS (
    SELECT 1 FROM public.inspection_violations iv WHERE iv.inspection_id = last.inspection_id
  ) AS has_any
  FROM (
    SELECT i.inspection_id
    FROM public.inspections i
    WHERE i.establishment_id = f.establishment_id
    ORDER BY i.inspection_date DESC, i.inspection_id DESC
    LIMIT 1
  ) last
) v ON true
WHERE f.lon IS NOT NULL AND f.lat IS NOT NULL;

GRANT SELECT ON public.v_facility_map_pins TO anon, authenticated;

-- Checks, after running (each should return 0 rows):
--
-- Same pins and scores as the feed:
--   SELECT establishment_id, premise_name, address, lon, lat,
--          inspection_date_recent, score_recent, grade_recent
--   FROM public.v_facility_map_pins
--   EXCEPT
--   SELECT establishment_id, premise_name, address, lon, lat,
--          inspection_date_recent, score_recent, grade_recent
--   FROM public.v_facility_map_feed;
--
-- Same rings as get_violation_flags():
--   SELECT p.establishment_id
--   FROM public.v_facility_map_pins p
--   LEFT JOIN public.get_violation_flags() g USING (establishment_id)
--   WHERE p.has_any_violation <> COALESCE(g.has_any, false);
--
-- Speed (the "Execution Time" line; expect well under 300 ms):
--   EXPLAIN (ANALYZE, BUFFERS)
--   SELECT * FROM public.v_facility_map_pins
--   ORDER BY establishment_id OFFSET 5000 LIMIT 1000;
