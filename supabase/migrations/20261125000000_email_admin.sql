-- Email admin (docs/EMAIL_ADMIN.md): the page at /?page=admin where the owner previews
-- anyone's weekly digest, sends tests and one-off emails, and sees what was sent.
--
-- How it is locked down:
--   * admin_users lists who is an admin. Nothing can read or write it through the API
--     (no grants, no policies): a row is added by hand in the SQL editor, at the bottom
--     of this file.
--   * The admin page calls the admin_* functions below with the signed-in person's own
--     session. Each one checks auth.uid() against admin_users first; for anyone else
--     the reads return nothing and the writes raise "Admins only".
--   * email_jobs and email_deliveries have no API access either. The site reaches them
--     only through those functions; the sender (pipeline/digest/outbox.js) uses the
--     service-role key.
--
-- Sending: the page queues a row in email_jobs; the "Email outbox" workflow sends it and
-- writes back what happened. email_deliveries has one row per address per job, which is
-- how a job that died part-way can be sent again without anyone getting it twice.
--
-- Needs 20261116000000_weekly_digest.sql. Run 20261124000000_digest_watch_areas.sql too
-- (before or after), or emails and previews have no watch-area parts.
-- Safe to run more than once.

-- ── Who is an admin ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  note text
);
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_users FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.admin_users TO service_role;

-- Is the signed-in person an admin? The only thing the API can learn about admin_users.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_users a WHERE a.user_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

-- The gate at the top of every admin function that changes something.
CREATE OR REPLACE FUNCTION public.assert_admin()
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_admin() FROM PUBLIC, anon, authenticated;

-- ── The outbox ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  queued_at timestamptz NOT NULL DEFAULT now(), -- moved forward by "send again"
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  -- admin: queued on the admin page. schedule: Tuesday's run. manual: the digest
  -- workflow or script run by hand.
  source text NOT NULL DEFAULT 'admin' CHECK (source IN ('admin', 'schedule', 'manual')),
  kind text NOT NULL CHECK (kind IN ('digest', 'custom')),
  audience text NOT NULL CHECK (audience IN ('emails', 'subscribers')),
  to_emails text[], -- audience 'emails': these addresses, and only these
  -- A digest written as this person's (their watch areas), sent to to_emails: how the
  -- owner sees someone's email in a real inbox without emailing them.
  as_user uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  days integer NOT NULL DEFAULT 7 CHECK (days BETWEEN 1 AND 30),
  test boolean NOT NULL DEFAULT false, -- "[Test]" in the subject
  subject text CHECK (char_length(subject) <= 150),
  body text CHECK (char_length(body) <= 10000),
  with_button boolean NOT NULL DEFAULT true, -- custom: the "Open the map" button
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sending', 'sent', 'partial', 'failed', 'cancelled', 'expired')),
  recipient_count integer,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  run_url text, -- the GitHub Actions run that sent it
  CONSTRAINT email_jobs_audience CHECK ((audience = 'subscribers') = (to_emails IS NULL)),
  CONSTRAINT email_jobs_custom CHECK (kind <> 'custom' OR (subject IS NOT NULL AND body IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS email_jobs_queued ON public.email_jobs (queued_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS email_jobs_recent ON public.email_jobs (created_at DESC);

CREATE TABLE IF NOT EXISTS public.email_deliveries (
  job_id uuid NOT NULL REFERENCES public.email_jobs (id) ON DELETE CASCADE,
  email text NOT NULL, -- lower case
  user_id uuid, -- the account it went to, when the address has one
  status text NOT NULL CHECK (status IN ('sent', 'failed')),
  error text,
  at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, email)
);
CREATE INDEX IF NOT EXISTS email_deliveries_user
  ON public.email_deliveries (user_id, at DESC) WHERE status = 'sent';

ALTER TABLE public.email_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_jobs, public.email_deliveries FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.email_jobs, public.email_deliveries TO service_role;

-- ── Reads (return nothing to anyone who isn't an admin) ──────────────────────────────

-- Accounts, subscribers first, a page at a time. `subscribers` is how many people the
-- weekly digest goes to (the same count on every row); `total` is how many rows match.
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

-- One person's watch areas for the week, for the preview: digest_watch_areas for them.
-- On a database without that function (20261124000000 not run yet) it returns nothing,
-- and the preview has no watch areas: exactly the email the sender would send there.
DROP FUNCTION IF EXISTS public.admin_digest_watch_areas(uuid, integer);
CREATE FUNCTION public.admin_digest_watch_areas(p_user_id uuid, p_days integer DEFAULT 7)
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
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT * FROM public.digest_watch_areas(
      least(greatest(coalesce(p_days, 7), 1), 30), ARRAY[p_user_id]);
EXCEPTION
  WHEN undefined_function THEN
    RETURN;
END;
$$;

-- Recent jobs, newest first, without the full message (admin_email_job has that).
DROP FUNCTION IF EXISTS public.admin_email_jobs(integer);
CREATE FUNCTION public.admin_email_jobs(p_limit integer DEFAULT 20)
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
  run_url text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT j.id, j.created_at, j.queued_at, j.source, j.kind, j.audience, j.to_emails,
    (SELECT coalesce(nullif(trim(p.alert_email), ''), p.email) FROM profiles p WHERE p.id = j.as_user),
    j.days, j.test, j.subject, j.status, j.recipient_count, j.sent_count, j.failed_count,
    left(j.error, 300), j.started_at, j.finished_at, j.run_url
  FROM email_jobs j
  WHERE is_admin()
  ORDER BY j.created_at DESC
  LIMIT least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

-- One job in full, to read a past message or write a new one from it.
CREATE OR REPLACE FUNCTION public.admin_email_job(p_id uuid)
RETURNS SETOF public.email_jobs
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT j.* FROM email_jobs j WHERE is_admin() AND j.id = p_id;
$$;

-- Who a job went to, failures first.
DROP FUNCTION IF EXISTS public.admin_email_deliveries(uuid);
CREATE FUNCTION public.admin_email_deliveries(p_job_id uuid)
RETURNS TABLE(email text, status text, error text, at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT d.email, d.status, left(d.error, 300), d.at
  FROM email_deliveries d
  WHERE is_admin() AND d.job_id = p_job_id
  ORDER BY (d.status = 'failed') DESC, d.email
  LIMIT 500;
$$;

-- ── Writes (raise "Admins only" for anyone else) ─────────────────────────────────────

-- Queue an email. Returns the job's id. The limits match packages/core/email/jobs.js.
--   p_audience 'emails': p_to_emails, at most 20.
--   p_audience 'subscribers': everyone on the weekly digest. p_expect_count must be the
--     number the page showed, so a stale page or a slip can't email a different crowd,
--     and only one such email can be on its way at a time.
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
  p_expect_count integer DEFAULT NULL
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
  -- A page stuck in a loop can't flood the queue (or Gmail's 500 a day).
  IF (SELECT count(*) FROM email_jobs j
       WHERE j.source = 'admin' AND j.created_at > now() - interval '1 hour') >= 30 THEN
    RAISE EXCEPTION 'Too many emails queued in the last hour. Try again later.';
  END IF;

  IF p_audience = 'subscribers' THEN
    IF p_as_user IS NOT NULL THEN
      RAISE EXCEPTION 'An email to every subscriber is each person''s own';
    END IF;
    SELECT count(*) INTO v_count FROM profiles p
     WHERE p.alert_frequency = 'weekly'
       AND coalesce(nullif(trim(p.alert_email), ''), p.email) LIKE '%@%';
    IF p_expect_count IS DISTINCT FROM v_count THEN
      RAISE EXCEPTION 'There are % subscribers now. Check the number and confirm again.', v_count;
    END IF;
    IF EXISTS (SELECT 1 FROM email_jobs j
                WHERE j.audience = 'subscribers' AND j.status IN ('queued', 'sending')) THEN
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
    subject, body, with_button, recipient_count)
  VALUES (
    auth.uid(), 'admin', p_kind, p_audience, v_emails,
    CASE WHEN p_kind = 'digest' THEN p_as_user END,
    CASE WHEN p_kind = 'digest' THEN least(greatest(coalesce(p_days, 7), 1), 30) ELSE 7 END,
    -- Someone else's digest in the owner's inbox is always marked as a test.
    coalesce(p_test, false) OR (p_kind = 'digest' AND p_as_user IS NOT NULL),
    CASE WHEN p_kind = 'custom' THEN trim(p_subject) END,
    CASE WHEN p_kind = 'custom' THEN p_body END,
    coalesce(p_with_button, true),
    v_count
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Stop a job that hasn't started. True when it was still queued.
CREATE OR REPLACE FUNCTION public.admin_cancel_email(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  n integer;
BEGIN
  PERFORM public.assert_admin();
  UPDATE email_jobs SET status = 'cancelled', finished_at = now()
   WHERE id = p_id AND status = 'queued';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$$;

-- Queue a job again: one that failed, was cut short, expired or was cancelled, or one
-- whose sender died (still "sending" after 15 minutes). The sender skips every address
-- email_deliveries already has as sent, so nobody gets it twice.
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
     SET status = 'queued', queued_at = now(), error = NULL, started_at = NULL, finished_at = NULL
   WHERE id = p_id
     AND (status IN ('failed', 'partial', 'expired', 'cancelled')
       OR (status = 'sending' AND started_at < now() - interval '15 minutes'));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$$;

-- Put someone on or take them off the weekly digest (say, when they ask by email).
CREATE OR REPLACE FUNCTION public.admin_set_subscription(p_user_id uuid, p_on boolean)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  n integer;
BEGIN
  PERFORM public.assert_admin();
  UPDATE profiles
     SET alert_frequency = CASE WHEN p_on THEN 'weekly' ELSE 'off' END, updated_at = now()
   WHERE id = p_user_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$$;

-- Signed-in people may call these (each checks for an admin itself); the public key may not.
DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'admin_subscribers(text, integer, integer)',
    'admin_digest_watch_areas(uuid, integer)',
    'admin_email_jobs(integer)',
    'admin_email_job(uuid)',
    'admin_email_deliveries(uuid)',
    'admin_queue_email(text, text, text[], uuid, integer, boolean, text, text, boolean, integer)',
    'admin_cancel_email(uuid)',
    'admin_retry_email(uuid)',
    'admin_set_subscription(uuid, boolean)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', f);
  END LOOP;
END;
$$;

-- ── Make yourself the admin ──────────────────────────────────────────────────────────
-- Run this once, with the email you sign in to the site with (sign in there first, so
-- the account exists). It should say "INSERT 0 1".
--
--   INSERT INTO public.admin_users (user_id, note)
--   SELECT id, 'owner' FROM auth.users WHERE lower(email) = lower('you@example.com')
--   ON CONFLICT (user_id) DO NOTHING;
--
-- Check who is an admin:   SELECT u.email, a.added_at FROM public.admin_users a JOIN auth.users u ON u.id = a.user_id;
-- Remove one:              DELETE FROM public.admin_users WHERE user_id = '<uuid>';
