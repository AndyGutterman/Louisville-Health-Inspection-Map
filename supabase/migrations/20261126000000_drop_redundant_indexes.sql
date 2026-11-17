-- Two indexes that duplicate others (docs/REFACTOR_PLAN.md, "Bugs to fix after the
-- refactor"). Each one is written on every insert and update and takes space on the free
-- plan's 500 MB, and no query needs it:
--
--   * inspections_establishment_id_idx (establishment_id) is covered by
--     inspections_est_idx (establishment_id, inspection_date DESC): its leading column
--     serves every lookup by establishment, including the ON DELETE CASCADE from
--     facilities.
--   * facilities_establishment_id_uidx (establishment_id, unique) repeats the primary key,
--     facilities_pkey.
--
-- A foreign key that points at facilities(establishment_id) may have been tied to the
-- second index rather than the primary key when it was created; Postgres then refuses to
-- drop it. In that case this leaves it in place and says so (a NOTICE in the output), so
-- the file always runs cleanly. Safe to run more than once.

DROP INDEX IF EXISTS public.inspections_establishment_id_idx;

DO $$
DECLARE
  idx oid := to_regclass('public.facilities_establishment_id_uidx');
  users text;
BEGIN
  IF idx IS NULL THEN
    RAISE NOTICE 'facilities_establishment_id_uidx is already gone';
    RETURN;
  END IF;

  SELECT string_agg(conname, ', ') INTO users
  FROM pg_constraint
  WHERE conindid = idx;

  IF users IS NOT NULL THEN
    RAISE NOTICE 'Kept facilities_establishment_id_uidx: % use it. Harmless; leave it.', users;
  ELSE
    DROP INDEX public.facilities_establishment_id_uidx;
    RAISE NOTICE 'Dropped facilities_establishment_id_uidx';
  END IF;
END $$;
