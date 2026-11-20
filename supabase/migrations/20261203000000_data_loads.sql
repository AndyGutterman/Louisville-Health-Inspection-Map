-- When each county's data last finished loading, so a visitor's saved map pins are read
-- again only after a load (apps/web/src/lib/mapCache.js), not at a fixed hour.
--
-- One row per county ('jefferson', 'bullitt'), written by the pipeline with the service
-- role at the end of a load that changed something (pipeline/mark_loaded.js, the Bullitt
-- ingest). The website reads both rows once per visit: about 100 bytes.
--
-- Safe to run more than once. Nothing assumes it has run: until it has, the pipeline logs
-- a warning and carries on, and the website keeps the old rule (pins refresh once a day).
-- No personal data.

CREATE TABLE IF NOT EXISTS public.data_loads (
  region text PRIMARY KEY CHECK (region ~ '^[a-z]+$'),
  loaded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.data_loads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS data_loads_read ON public.data_loads;
CREATE POLICY data_loads_read ON public.data_loads
  FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON public.data_loads TO anon, authenticated;
GRANT ALL ON public.data_loads TO service_role;
