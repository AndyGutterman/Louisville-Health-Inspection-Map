-- Email admin, round two (docs/EMAIL_ADMIN.md):
--   * older sends on the Sent tab (admin_email_jobs pages, with send_at),
--   * a one-off email scheduled for later (admin_queue_email takes p_send_at),
--   * a pause on Tuesday's weekly digest (email_settings, one row).
--
-- Needs 20261125000000_email_admin.sql. Safe to run more than once. Nothing else
-- assumes it has run: until it has, the Sent tab and the scheduling stay as they were.

-- ── Scheduled sends: null means "as soon as the sender runs" ─────────────────────────
ALTER TABLE public.email_jobs ADD COLUMN IF NOT EXISTS send_at timestamptz;

-- ── The pause on Tuesday's digest: one row ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  digest_paused boolean NOT NULL DEFAULT false,
  paused_at timestamptz,
  paused_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);
INSERT INTO public.email_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.email_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.email_settings TO service_role;

-- Is the digest paused? Admins only; anyone else is told "not paused" (the page hides it).
CREATE OR REPLACE FUNCTION public.admin_digest_paused()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce((SELECT s.digest_paused FROM public.email_settings s
                    WHERE s.id = 1 AND public.is_admin()), false);
$$;

-- Pause or resume Tuesday's digest. It stops only the scheduled send; a send started by
-- hand from the digest workflow or this page still goes.
CREATE OR REPLACE FUNCTION public.admin_set_digest_paused(p_paused boolean)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.assert_admin();
  UPDATE public.email_settings
     SET digest_paused = coalesce(p_paused, false),
         paused_at = CASE WHEN coalesce(p_paused, false) THEN now() ELSE NULL END,
         paused_by = CASE WHEN coalesce(p_paused, false) THEN auth.uid() ELSE NULL END
   WHERE id = 1;
  RETURN coalesce(p_paused, false);
END;
$$;

-- ── Older sends: a page at a time, with when each one is scheduled for ───────────────
DROP FUNCTION IF EXISTS public.admin_email_jobs(integer);
CREATE OR REPLACE FUNCTION public.admin_email_jobs(p_limit integer DEFAULT 10, p_offset integer DEFAULT 0)
RETURNS TABLE(
  id uuid,
  created_at timestamptz,
  queued_at timestamptz,
  source text,
  kind text,
  audience text,
  to_emails text[],
  as_user_email text,
  days integer,
  test boolean,
  subject text,
  status text,
  recipient_count integer,
  sent_count integer,
  failed_count integer,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  run_url text,
  send_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT j.id, j.created_at, j.queued_at, j.source, j.kind, j.audience, j.to_emails,
    (SELECT coalesce(nullif(trim(p.alert_email), ''), p.email) FROM profiles p WHERE p.id = j.as_user),
    j.days, j.test, j.subject, j.status, j.recipient_count, j.sent_count, j.failed_count,
    left(j.error, 300), j.started_at, j.finished_at, j.run_url, j.send_at
  FROM email_jobs j
  WHERE is_admin()
  ORDER BY j.created_at DESC
  LIMIT least(greatest(coalesce(p_limit, 10), 1), 50)
  OFFSET greatest(coalesce(p_offset, 0), 0);
$$;

-- ── Queue an email, now or at p_send_at ──────────────────────────────────────────────
-- The same checks as 20261125000000 (see there), plus: p_send_at is a time between now
-- and 30 days ahead, and only a one-off email can be scheduled.
DROP FUNCTION IF EXISTS public.admin_queue_email(
  text, text, text[], uuid, integer, boolean, text, text, boolean, integer);
CREATE OR REPLACE FUNCTION public.admin_queue_email(
  p_kind text,
  p_audience text,
  p_to_emails text[] DEFAULT NULL,
  p_as_user uuid DEFAULT NULL,
  p_days integer DEFAULT 7,
  p_test boolean DEFAULT false,
  p_subject text DEFAULT NULL,
  p_body text DEFAULT NULL,
  p_with_button boolean DEFAULT true,
  p_expect_count integer DEFAULT NULL,
  p_send_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_emails text[];
  v_count integer;
  v_id uuid;
BEGIN
  PERFORM public.assert_admin();

  IF p_kind IS NULL OR p_kind NOT IN ('digest', 'custom') THEN
    RAISE EXCEPTION 'Unknown kind of email';
  END IF;
  IF p_send_at IS NOT NULL THEN
    IF p_kind <> 'custom' THEN
      RAISE EXCEPTION 'Only a one-off email can be scheduled';
    ELSIF p_send_at <= now() THEN
      RAISE EXCEPTION 'Pick a time in the future';
    ELSIF p_send_at > now() + interval '30 days' THEN
      RAISE EXCEPTION 'Schedule up to 30 days ahead';
    END IF;
  END IF;
  -- A page stuck in a loop can't flood the queue (or Gmail's 500 a day).
  IF (SELECT count(*) FROM email_jobs j
       WHERE j.source = 'admin' AND j.created_at > now() - interval '1 hour') >= 30 THEN
    RAISE EXCEPTION 'Too many emails queued in the last hour. Try again later.';
  END IF;

  IF p_audience = 'subscribers' THEN
    IF p_as_user IS NOT NULL THEN
      RAISE EXCEPTION 'An email to every subscriber is each person''s own';
    END IF;
    -- Its count is checked now; a scheduled one could go to a different crowd, so it goes now.
    IF p_send_at IS NOT NULL THEN
      RAISE EXCEPTION 'An email to every subscriber goes out now, not later';
    END IF;
    SELECT count(*) INTO v_count FROM profiles p
     WHERE p.alert_frequency = 'weekly'
       AND coalesce(nullif(trim(p.alert_email), ''), p.email) LIKE '%@%';
    IF p_expect_count IS DISTINCT FROM v_count THEN
      RAISE EXCEPTION 'There are % subscribers now. Check the number and confirm again.', v_count;
    END IF;
    -- A send that died (still "sending" after 15 minutes) doesn't block the next one.
    IF EXISTS (SELECT 1 FROM email_jobs j
                WHERE j.audience = 'subscribers'
                  AND (j.status = 'queued'
                    OR (j.status = 'sending' AND j.started_at > now() - interval '15 minutes'))) THEN
      RAISE EXCEPTION 'An email to every subscriber is already on its way';
    END IF;
    v_emails := NULL;
  ELSIF p_audience = 'emails' THEN
    -- Each address once, whatever its capitals.
    SELECT array_agg(e ORDER BY e) INTO v_emails
      FROM (SELECT DISTINCT ON (lower(trim(x))) trim(x) AS e
              FROM unnest(coalesce(p_to_emails, '{}')) x
             WHERE trim(x) <> ''
             ORDER BY lower(trim(x))) t;
    v_count := coalesce(array_length(v_emails, 1), 0);
    IF v_count = 0 THEN
      RAISE EXCEPTION 'Add at least one address';
    ELSIF v_count > 20 THEN
      RAISE EXCEPTION '20 addresses at most';
    ELSIF EXISTS (SELECT 1 FROM unnest(v_emails) e
                   WHERE e !~ '^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$') THEN
      RAISE EXCEPTION 'One of those isn''t an email address';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unknown audience';
  END IF;

  IF p_kind = 'custom' THEN
    IF coalesce(trim(p_subject), '') = '' THEN
      RAISE EXCEPTION 'Add a subject';
    ELSIF coalesce(trim(p_body), '') = '' THEN
      RAISE EXCEPTION 'Write a message';
    ELSIF char_length(trim(p_subject)) > 150 OR char_length(p_body) > 10000 THEN
      RAISE EXCEPTION 'The subject or the message is too long';
    END IF;
  END IF;

  INSERT INTO email_jobs (created_by, source, kind, audience, to_emails, as_user, days, test,
    subject, body, with_button, recipient_count, send_at)
  VALUES (
    auth.uid(), 'admin', p_kind, p_audience, v_emails,
    CASE WHEN p_kind = 'digest' THEN p_as_user END,
    CASE WHEN p_kind = 'digest' THEN least(greatest(coalesce(p_days, 7), 1), 30) ELSE 7 END,
    -- Someone else's digest in the owner's inbox is always marked as a test.
    coalesce(p_test, false) OR (p_kind = 'digest' AND p_as_user IS NOT NULL),
    CASE WHEN p_kind = 'custom' THEN trim(p_subject) END,
    CASE WHEN p_kind = 'custom' THEN p_body END,
    coalesce(p_with_button, true),
    v_count,
    p_send_at
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ── Send again: a scheduled email that is sent again goes now ────────────────────────
-- The same as 20261125000000's admin_retry_email, and clears send_at: a time that has
-- passed would otherwise make the job expire at once.
CREATE OR REPLACE FUNCTION public.admin_retry_email(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  n integer;
BEGIN
  PERFORM public.assert_admin();
  UPDATE email_jobs
     SET status = 'queued', queued_at = now(), send_at = NULL, error = NULL,
         started_at = NULL, finished_at = NULL
   WHERE id = p_id
     AND (status IN ('failed', 'partial', 'expired', 'cancelled')
       OR (status = 'sending' AND started_at < now() - interval '15 minutes'));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$$;

-- ── Grants: signed-in people may call these (each checks for an admin itself) ────────
REVOKE ALL ON FUNCTION public.admin_digest_paused(), public.admin_set_digest_paused(boolean),
  public.admin_email_jobs(integer, integer),
  public.admin_queue_email(text, text, text[], uuid, integer, boolean, text, text, boolean, integer, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_digest_paused(), public.admin_set_digest_paused(boolean),
  public.admin_email_jobs(integer, integer),
  public.admin_queue_email(text, text, text[], uuid, integer, boolean, text, text, boolean, integer, timestamptz)
  TO authenticated, service_role;
