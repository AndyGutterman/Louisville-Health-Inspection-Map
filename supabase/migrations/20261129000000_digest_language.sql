-- The language of each person's weekly email (English or Spanish).
--
-- profiles.language is 'en' or 'es'. It is set when someone signs up from the Spanish site,
-- and when a signed-in subscriber accepts the offer to get the weekly email in the site's
-- language. The digest sender (pipeline/digest) renders each copy in it, and the email
-- admin page's list and preview show it. Everyone who signed up before this is 'en'.
--
-- Safe to run twice. Run it in the Supabase SQL editor.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en';
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_language_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_language_check CHECK (language IN ('en', 'es'));

-- admin_subscribers now also returns each person's language (for the preview).
DROP FUNCTION IF EXISTS public.admin_subscribers(text, integer, integer);
CREATE FUNCTION public.admin_subscribers(
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  user_id uuid,
  email text,
  alert_frequency text,
  language text,
  created_at timestamptz,
  watch_areas bigint,
  saved_places bigint,
  last_sent_at timestamptz,
  total bigint,
  subscribers bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id,
    coalesce(nullif(trim(p.alert_email), ''), p.email),
    p.alert_frequency,
    p.language,
    p.created_at,
    (SELECT count(*) FROM watchlist_areas a WHERE a.user_id = p.id),
    (SELECT count(*) FROM watchlist w WHERE w.user_id = p.id),
    (SELECT max(d.at) FROM email_deliveries d WHERE d.user_id = p.id AND d.status = 'sent'),
    count(*) OVER (),
    (SELECT count(*) FROM profiles s
      WHERE s.alert_frequency = 'weekly'
        AND coalesce(nullif(trim(s.alert_email), ''), s.email) LIKE '%@%')
  FROM profiles p
  WHERE is_admin()
    AND (coalesce(trim(p_search), '') = ''
      OR p.email ILIKE '%' || trim(p_search) || '%'
      OR p.alert_email ILIKE '%' || trim(p_search) || '%')
  ORDER BY (p.alert_frequency = 'weekly') DESC NULLS LAST, p.created_at DESC NULLS LAST, p.id
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 100)
  OFFSET greatest(coalesce(p_offset, 0), 0);
$$;

REVOKE ALL ON FUNCTION public.admin_subscribers(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_subscribers(text, integer, integer)
  TO authenticated, service_role;
