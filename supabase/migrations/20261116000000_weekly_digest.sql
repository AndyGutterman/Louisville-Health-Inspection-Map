-- Weekly digest email (pipeline/digest/send.js, .github/workflows/digest.yml).
--
-- A profile subscribes with alert_frequency = 'weekly' (the sign-in checkbox and the
-- account toggle). 'off' is the new default and what the unsubscribe link sets; the old
-- 'instant'/'daily' values stay allowed but nothing sends them. Each profile gets a
-- digest_token for the one-click unsubscribe link in the email footer, which the site
-- turns into the unsubscribe_by_token call (AuthContext.jsx), so no sign-in is needed.
-- Safe to run twice.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS digest_token uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS profiles_digest_token_key ON public.profiles (digest_token);

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_alert_frequency_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_alert_frequency_check
  CHECK (alert_frequency = ANY (ARRAY['off'::text, 'instant'::text, 'daily'::text, 'weekly'::text]));
ALTER TABLE public.profiles ALTER COLUMN alert_frequency SET DEFAULT 'off';

-- The token is a secret: only the service role (the digest job) may read it.
REVOKE SELECT (digest_token) ON public.profiles FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.unsubscribe_by_token(p_token text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE public.profiles SET alert_frequency = 'off', updated_at = now()
   WHERE digest_token::text = p_token AND alert_frequency <> 'off';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.unsubscribe_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unsubscribe_by_token(text) TO anon, authenticated, service_role;
