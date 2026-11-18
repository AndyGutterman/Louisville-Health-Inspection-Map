-- The pin-fixes job's write (pipeline/pins/fixJob.js, docs/PINS.md): the outcome of one
-- address fix and, when found inside the county, its pin on the map, in one transaction.
-- Needs 20261130000000_place_fixes.sql.
--
-- p_updated_at is the fix as the job read it: when the admin saved the fix again while
-- the job was looking it up, nothing is written and the answer is false.
CREATE OR REPLACE FUNCTION public.place_fix_record_result(
  p_place_id text,
  p_updated_at timestamptz,
  p_status text,
  p_lon double precision,
  p_lat double precision,
  p_provider text,
  p_query text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_fix public.place_fixes;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('found', 'outside', 'not_found') THEN
    RAISE EXCEPTION 'Unknown outcome "%"', p_status USING ERRCODE = '22023';
  END IF;
  UPDATE public.place_fixes SET
    status = p_status,
    result_lon = p_lon,
    result_lat = p_lat,
    result_provider = p_provider,
    result_query = p_query,
    tried_at = now()
  WHERE place_id = p_place_id
    AND action = 'address'
    AND status = 'pending'
    AND updated_at = p_updated_at
  RETURNING * INTO v_fix;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_status = 'found' THEN
    PERFORM public.place_fix_write_pin(v_fix.region, p_place_id, p_lon, p_lat, p_provider, false);
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.place_fix_record_result(text, timestamptz, text, double precision, double precision, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_fix_record_result(text, timestamptz, text, double precision, double precision, text, text)
  TO service_role;
