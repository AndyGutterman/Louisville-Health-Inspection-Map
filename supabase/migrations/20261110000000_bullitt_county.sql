-- Bullitt County inspections (MVP, branch feat/bullitt-county).
--
-- Source: the Bullitt County Health Department's public Google Sheet behind the
-- drop-down on bullitthealth.org/food. One row per establishment with only its LATEST
-- inspection (score, violations) and follow-up (date, score, violations). No ids and no
-- date for the latest inspection. pipeline/regions/bullitt/ingest.js loads it daily.
--
-- Kept apart from facilities/inspections on purpose: the site that is live reads those
-- tables everywhere (map, What's New, Table View, Learn page), so Bullitt rows there
-- would go live before the design is settled. Merging the two is a later decision
-- (see docs/BULLITT.md).
--
-- Only adds objects. Safe to run more than once.

CREATE TABLE IF NOT EXISTS public.bullitt_establishments (
  id text PRIMARY KEY,                  -- 'bullitt-' + hash of name and address
  name text NOT NULL,
  address text,
  city text,                            -- spelling fixed (SHEPHERDSVLLE -> SHEPHERDSVILLE)
  raw_city text,                        -- as written in the sheet
  state text NOT NULL DEFAULT 'KY',
  lon double precision,
  lat double precision,
  geocode_provider text,                -- nominatim | census
  geocode_query text,
  geocode_outside_county boolean,       -- best match fell outside the county outline
  geocoded_at timestamptz,              -- last attempt, hit or miss
  first_seen date NOT NULL,             -- first load that had this place
  last_seen date NOT NULL,              -- latest load that had it
  active boolean NOT NULL DEFAULT true  -- false once it drops off the sheet
);

-- Every version of a row's inspections we have seen. The sheet only ever shows the
-- latest, so a new score or violation list becomes a new row here, and history builds
-- up from the first load on.
CREATE TABLE IF NOT EXISTS public.bullitt_inspections (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  establishment_id text NOT NULL
    REFERENCES public.bullitt_establishments (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('routine', 'follow_up')),
  inspection_date date,                 -- only follow-ups have a date in the sheet
  score numeric,
  violations text[] NOT NULL DEFAULT '{}',  -- inspection-form items, as written
  content_hash text NOT NULL,
  first_seen date NOT NULL,             -- first load that showed this version
  last_seen date NOT NULL,              -- latest load that showed it
  UNIQUE (establishment_id, kind, content_hash)
);

-- A copy of the sheet each time it changes, so history can be rebuilt if the parsing
-- improves. Not readable through the API.
CREATE TABLE IF NOT EXISTS public.bullitt_snapshots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  sha256 text NOT NULL,
  row_count integer NOT NULL,
  csv text NOT NULL
);

ALTER TABLE public.bullitt_establishments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bullitt_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bullitt_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bullitt_establishments_read ON public.bullitt_establishments;
CREATE POLICY bullitt_establishments_read ON public.bullitt_establishments
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS bullitt_inspections_read ON public.bullitt_inspections;
CREATE POLICY bullitt_inspections_read ON public.bullitt_inspections
  FOR SELECT TO anon, authenticated USING (true);

-- One row per place with a pin: its latest routine inspection, and the follow-up
-- currently on the sheet, if any. Same column names as v_facility_map_feed where the
-- meaning is the same.
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
  f.score AS follow_up_score
FROM public.bullitt_establishments e
LEFT JOIN LATERAL (
  SELECT i.score, i.violations
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

GRANT SELECT ON public.bullitt_establishments, public.bullitt_inspections TO anon, authenticated;
GRANT SELECT ON public.v_bullitt_map_feed TO anon, authenticated;
REVOKE ALL ON public.bullitt_snapshots FROM anon, authenticated;
