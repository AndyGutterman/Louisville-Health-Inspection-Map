-- The weekly digest's "Your saved places" part (pipeline/digest/send.js, docs/DIGEST.md):
-- each subscriber's saved places that were inspected in the window, at the top of the
-- email. The email shows each place once: one listed here is left out of the watch areas
-- and the shared lists below it (packages/core/email/digest.js).
--
-- One read for the whole send. Rows are only for saved places inspected in the window
-- (the latest inspection of each), so the job downloads a few rows per subscriber at
-- most. Someone whose saved places had no inspection returns one row with no place, so
-- the email can say so; someone with no saved places returns nothing.
--
-- Lists: today every saved place is in one list per account, so list_id and list_name are
-- null. The columns are here so accounts can one day keep several lists (each its own part
-- of the email) without dropping and recreating this function; saved_total is the count
-- of the list's places. The email already groups by list (groupSavedPlaces).
--
-- digest_saved_places: service role only (it reads other people's saved places).
-- admin_digest_saved_places: the email admin page's preview of one person, for admins
-- only (is_admin(), migration 20261125000000), like admin_digest_watch_areas.
-- Safe to run more than once.

CREATE OR REPLACE FUNCTION public.digest_saved_places(
  p_days integer DEFAULT 7,
  p_user_ids uuid[] DEFAULT NULL
)
RETURNS TABLE(
  user_id uuid,
  list_id uuid,
  list_name text,
  saved_total bigint,
  establishment_id text,
  premise_name text,
  address text,
  score integer,
  grade text,
  inspection_date date,
  posted_date date,
  violation_count bigint,
  region text
)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  with saved as (
    select w.user_id, w.establishment_id,
      count(*) over (partition by w.user_id) as saved_total
    from watchlist w
    join profiles p on p.id = w.user_id
    where case
      when p_user_ids is null then p.alert_frequency = 'weekly'
      else w.user_id = any (p_user_ids)
    end
  ),
  -- The same rows the rest of the email is built from (get_whats_new: both counties).
  recent as (
    select g.establishment_id, g.premise_name, g.address, g.score, g.grade,
      g.inspection_date, g.posted_date, g.violation_count, g.region,
      (upper(coalesce(g.grade, '')) = 'C' or g.score < 85) as failing
    from get_whats_new(100000) g
    where coalesce(g.inspection_date, g.posted_date) > current_date - p_days
  ),
  hits as (
    select s.user_id, r.*,
      row_number() over (
        partition by s.user_id, r.establishment_id
        order by coalesce(r.inspection_date, r.posted_date) desc
      ) as newest
    from saved s
    join recent r on r.establishment_id = s.establishment_id
  ),
  people as (
    select distinct s.user_id, s.saved_total from saved s
  )
  select u.user_id, null::uuid, null::text, u.saved_total, h.establishment_id, h.premise_name, h.address,
    h.score, h.grade, h.inspection_date, h.posted_date, h.violation_count, h.region
  from people u
  left join hits h on h.user_id = u.user_id and h.newest = 1
  order by u.user_id, h.failing desc nulls last, h.violation_count desc nulls last,
    coalesce(h.inspection_date, h.posted_date) desc nulls last, h.establishment_id;
$$;

REVOKE ALL ON FUNCTION public.digest_saved_places(integer, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.digest_saved_places(integer, uuid[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.digest_saved_places(integer, uuid[]) TO service_role;

DROP FUNCTION IF EXISTS public.admin_digest_saved_places(uuid, integer);
CREATE FUNCTION public.admin_digest_saved_places(p_user_id uuid, p_days integer DEFAULT 7)
RETURNS TABLE(
  user_id uuid,
  list_id uuid,
  list_name text,
  saved_total bigint,
  establishment_id text,
  premise_name text,
  address text,
  score integer,
  grade text,
  inspection_date date,
  posted_date date,
  violation_count bigint,
  region text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT * FROM public.digest_saved_places(
      least(greatest(coalesce(p_days, 7), 1), 30), ARRAY[p_user_id]);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_digest_saved_places(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_digest_saved_places(uuid, integer) TO authenticated;
