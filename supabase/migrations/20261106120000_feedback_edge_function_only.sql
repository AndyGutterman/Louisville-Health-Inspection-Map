-- Feedback is written only by the submit-feedback edge function (which uses the
-- service role and rate-limits by IP) and read only in the Supabase dashboard.
--
-- 1. Signed-in users could read every submission, including names and emails.
-- 2. Anonymous users could insert directly, skipping the edge function's rate limit.
--
-- With both policies gone and row-level security still on, the API can neither
-- read nor write this table. The service role and the dashboard bypass RLS.

DROP POLICY IF EXISTS auth_can_read_feedback ON public.feedback;
DROP POLICY IF EXISTS anon_can_insert_feedback ON public.feedback;
