-- Account system: profiles, watchlist, watchlist_areas, violation_alerts
-- RLS: users can only read/write their own rows; service role can read all.

-- ─── profiles ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id                uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email             text,
  display_name      text,
  alert_email       text,
  alert_frequency   text        DEFAULT 'instant' CHECK (alert_frequency IN ('instant', 'daily', 'weekly')),
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own"   ON public.profiles FOR SELECT  USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own"   ON public.profiles FOR INSERT  WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own"   ON public.profiles FOR UPDATE  USING (auth.uid() = id);
CREATE POLICY "profiles_service_read" ON public.profiles FOR SELECT  TO service_role USING (true);

-- Auto-create profile on sign-up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── watchlist ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.watchlist (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  establishment_id text        NOT NULL REFERENCES public.facilities(establishment_id) ON DELETE CASCADE,
  created_at       timestamptz DEFAULT now(),
  UNIQUE (user_id, establishment_id)
);

ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "watchlist_all_own"      ON public.watchlist USING (auth.uid() = user_id);
CREATE POLICY "watchlist_service_read" ON public.watchlist FOR SELECT TO service_role USING (true);

-- ─── watchlist_areas ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.watchlist_areas (
  id              uuid             DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         uuid             NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label           text,
  center_address  text,
  center_lat      double precision,
  center_lon      double precision,
  radius_miles    integer          DEFAULT 5 CHECK (radius_miles IN (5, 10, 15, 25)),
  created_at      timestamptz      DEFAULT now(),
  updated_at      timestamptz      DEFAULT now()
);

ALTER TABLE public.watchlist_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "areas_all_own"      ON public.watchlist_areas USING (auth.uid() = user_id);
CREATE POLICY "areas_service_read" ON public.watchlist_areas FOR SELECT TO service_role USING (true);

-- ─── violation_alerts ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.violation_alerts (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  keyword    text        NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, keyword)
);

ALTER TABLE public.violation_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alerts_all_own"      ON public.violation_alerts USING (auth.uid() = user_id);
CREATE POLICY "alerts_service_read" ON public.violation_alerts FOR SELECT TO service_role USING (true);

-- Grant read to authenticated users (they need SELECT for their own rows via RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.watchlist TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.watchlist_areas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.violation_alerts TO authenticated;
