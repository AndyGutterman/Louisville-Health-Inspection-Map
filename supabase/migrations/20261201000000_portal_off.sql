-- Kentucky's inspection portal is off until there is permission to use it
-- (docs/COUNTIES.md, "Paused"). Nothing is deleted: the portal_* tables keep every row.
--
--   bullitt_results   Bullitt's results come from the county's own sheet only, whatever
--                     portal_regions says. Same columns as 20261120000000 (source is
--                     always 'sheet'), so every view built on it is unchanged.
--   portal_*          The site can no longer read them: SELECT revoked from anon and
--   v_portal_map_feed authenticated. The pipeline uses the service role and keeps access.
--
-- Safe to run more than once. To undo: run the bullitt_results view from
-- 20261120000000_bullitt_portal_results.sql again, and
--   GRANT SELECT ON public.portal_regions, public.portal_establishments,
--     public.portal_inspections, public.v_portal_map_feed TO anon, authenticated;

CREATE OR REPLACE VIEW public.bullitt_results WITH (security_invoker = true) AS
WITH picked AS (
  SELECT b.id, b.establishment_id, b.kind, b.inspection_date, b.score, b.violations,
         b.content_hash, b.first_seen, b.last_seen, 'sheet'::text AS source
  FROM public.bullitt_inspections b
)
SELECT r.*,
  r.last_seen = max(r.last_seen) OVER (PARTITION BY r.establishment_id) AS current,
  (r.inspection_date IS NULL
   OR row_number() OVER (
        PARTITION BY r.establishment_id, r.kind, r.inspection_date
        ORDER BY r.last_seen DESC, r.id DESC) = 1) AS latest_version
FROM picked r;

GRANT SELECT ON public.bullitt_results TO anon, authenticated;

REVOKE SELECT ON public.portal_regions, public.portal_establishments,
  public.portal_inspections, public.v_portal_map_feed FROM anon, authenticated;
