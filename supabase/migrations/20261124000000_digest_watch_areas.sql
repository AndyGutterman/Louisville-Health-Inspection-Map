-- The weekly digest's watch-area sections (pipeline/digest/send.js): for each watch area
-- of each subscriber, this week's inspections inside the circle, as its own part of the
-- email.
--
-- One read for the whole send. Each area returns at most p_rows places (failing first,
-- then most violations) with the area's totals on every row, so the job downloads a few
-- rows per area, never a county. An area with nothing inspected returns one row with no
-- place, so the email can say so.
--
-- p_user_ids: NULL for every weekly subscriber; a list for a test send to those accounts.
-- Service role only: it reads other people's watch areas.
-- Safe to run more than once.

CREATE OR REPLACE FUNCTION public.digest_watch_areas(
  p_days integer DEFAULT 7,
  p_user_ids uuid[] DEFAULT NULL,
  p_rows integer DEFAULT 8
)
RETURNS TABLE(
  user_id uuid,
  area_id uuid,
  label text,
  center_address text,
  radius_miles integer,
  area_total bigint,
  area_failing bigint,
  place_rank bigint,
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
  with areas as (
    select a.id, a.user_id, a.label, a.center_address, a.center_lat, a.center_lon,
      a.radius_miles, a.created_at
    from watchlist_areas a
    join profiles p on p.id = a.user_id
    where case
      when p_user_ids is null then p.alert_frequency = 'weekly'
      else a.user_id = any (p_user_ids)
    end
  ),
  -- The same rows the email's main part is built from (get_whats_new covers 30 days of
  -- both counties), with each place's coordinates.
  recent as (
    select w.establishment_id, w.premise_name, w.address, w.score, w.grade,
      w.inspection_date, w.posted_date, w.violation_count, w.region,
      coalesce(f.lat, e.lat) as lat,
      coalesce(f.lon, e.lon) as lon,
      (upper(coalesce(w.grade, '')) = 'C' or w.score < 85) as failing
    from get_whats_new(100000) w
    left join facilities f
      on w.region = 'jefferson' and f.establishment_id::text = w.establishment_id
    left join bullitt_establishments e
      on w.region = 'bullitt' and e.id::text = w.establishment_id
    where coalesce(w.inspection_date, w.posted_date) > current_date - p_days
  ),
  -- Places in each circle: its bounding box first (cheap), then the exact distance.
  hits as (
    select a.id as area_id, r.*
    from areas a
    join recent r
      on r.lat between a.center_lat - a.radius_miles / 69.0 and a.center_lat + a.radius_miles / 69.0
     and r.lon between a.center_lon - a.radius_miles / 55.0 and a.center_lon + a.radius_miles / 55.0
     and 2 * 3958.8 * asin(least(1, sqrt(
           power(sin(radians(r.lat - a.center_lat) / 2), 2) +
           cos(radians(a.center_lat)) * cos(radians(r.lat)) *
           power(sin(radians(r.lon - a.center_lon) / 2), 2)
         ))) <= a.radius_miles
  ),
  ranked as (
    select h.*,
      count(*) over (partition by h.area_id) as area_total,
      count(*) filter (where h.failing) over (partition by h.area_id) as area_failing,
      row_number() over (
        partition by h.area_id
        order by h.failing desc, h.violation_count desc,
          coalesce(h.inspection_date, h.posted_date) desc, h.establishment_id
      ) as place_rank
    from hits h
  )
  select a.user_id, a.id, a.label, a.center_address, a.radius_miles,
    coalesce(k.area_total, 0), coalesce(k.area_failing, 0), k.place_rank,
    k.establishment_id, k.premise_name, k.address, k.score, k.grade,
    k.inspection_date, k.posted_date, k.violation_count, k.region
  from areas a
  left join ranked k on k.area_id = a.id and k.place_rank <= p_rows
  order by a.user_id, a.created_at, a.id, k.place_rank;
$$;

REVOKE ALL ON FUNCTION public.digest_watch_areas(integer, uuid[], integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.digest_watch_areas(integer, uuid[], integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.digest_watch_areas(integer, uuid[], integer) TO service_role;
