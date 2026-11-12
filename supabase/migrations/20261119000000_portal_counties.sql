-- Counties read from Kentucky's statewide inspection portal (docs/COUNTIES.md). Oldham
-- first. pipeline/regions/kyportal/ingest.js loads them daily (portal-ingest.yml).
--
-- Kept apart from Jefferson's tables (ArcGIS) and Bullitt's (the county's sheet) on
-- purpose: those keep loading from their own sources whatever happens to the portal, so
-- losing it never takes a county away that we had before (docs/COUNTIES.md, "If the
-- portal goes away"). Nothing the site reads changes here; showing Oldham is a later step.
--
-- The portal shows each place's LATEST inspection and follow-up, with dates. A result we
-- have not seen before becomes a new row, so history builds up from the first load on.
--
-- Only adds objects. Safe to run more than once.

-- One row per county: when the portal last answered for it, and what it held. The job
-- writes this on every successful read, changed or not, so a county whose last_checked_at
-- stops moving is one the portal has stopped serving.
CREATE TABLE IF NOT EXISTS public.portal_regions (
  region text PRIMARY KEY,              -- 'oldham': the site's region id
  county_number integer NOT NULL,       -- the portal's ?County= value (Oldham 93)
  last_checked_at timestamptz NOT NULL, -- last successful read
  last_changed_at timestamptz NOT NULL, -- last read that differed from the one before
  content_sha256 text NOT NULL,         -- of the parsed places, not the page (the page's
                                        -- form state changes on every request)
  place_count integer NOT NULL,
  inspection_count integer NOT NULL
);

CREATE TABLE IF NOT EXISTS public.portal_establishments (
  id text PRIMARY KEY,                  -- '<region>-' + hash of name and address
  region text NOT NULL,                 -- 'oldham'
  name text NOT NULL,
  address text,
  city text,                            -- spelling fixed (LAGRANGE -> LA GRANGE)
  raw_city text,                        -- as the portal writes it
  state text NOT NULL DEFAULT 'KY',
  lon double precision,
  lat double precision,
  geocode_provider text,                -- ky911 | census | nominatim | manual | ...
  geocode_query text,
  geocode_outside_county boolean,       -- best match fell outside the county outline
  geocoded_at timestamptz,              -- last attempt, hit or miss
  first_seen date NOT NULL,             -- first load that had this place
  last_seen date NOT NULL,              -- latest load that had it
  active boolean NOT NULL DEFAULT true, -- false once it drops off the portal
  CHECK (starts_with(id, region || '-'))
);
CREATE INDEX IF NOT EXISTS portal_establishments_region ON public.portal_establishments (region);

-- Every result we have seen. A place can hold several routine inspections on one day
-- (a school's cafeteria and its playground), so the date alone doesn't identify one; the
-- content hash (kind, date, score, items) does.
CREATE TABLE IF NOT EXISTS public.portal_inspections (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  establishment_id text NOT NULL
    REFERENCES public.portal_establishments (id) ON DELETE CASCADE,
  region text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('routine', 'follow_up')),
  inspection_date date,
  score numeric,
  grade text,                           -- a few rows read 98/A
  violations text[] NOT NULL DEFAULT '{}',  -- inspection-form items marked, as written
  content_hash text NOT NULL,
  first_seen date NOT NULL,             -- first load that showed this result
  last_seen date NOT NULL,              -- latest load that showed it
  UNIQUE (establishment_id, kind, content_hash)
);
CREATE INDEX IF NOT EXISTS portal_inspections_region ON public.portal_inspections (region);

ALTER TABLE public.portal_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_establishments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_inspections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portal_regions_read ON public.portal_regions;
CREATE POLICY portal_regions_read ON public.portal_regions
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS portal_establishments_read ON public.portal_establishments;
CREATE POLICY portal_establishments_read ON public.portal_establishments
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS portal_inspections_read ON public.portal_inspections;
CREATE POLICY portal_inspections_read ON public.portal_inspections
  FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON public.portal_regions, public.portal_establishments, public.portal_inspections
  TO anon, authenticated;
