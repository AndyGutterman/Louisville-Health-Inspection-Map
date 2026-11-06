-- Baseline: the production database schema (public schema only) as of 2026-11-06.
--
-- Exported with the "Export database schema" workflow (.github/workflows/schema-dump.yml)
-- and lightly cleaned: psql-only \restrict lines and CREATE SCHEMA public (which
-- every Supabase project already has) were removed. Everything else is pg_dump output.
--
-- This replaces the older hand-written migrations, several of which no longer
-- matched production. See supabase/README.md for how to make schema changes.

--
-- PostgreSQL database dump
--

\restrict LLW5sTIZ7G9C7hg5VQIUKVee0iufENcsCCsTswJUIwcbQtdd7w4ZqS0Z76PRvuO

-- Dumped from database version 17.4
-- Dumped by pg_dump version 17.11 (Ubuntu 17.11-1.pgdg24.04+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--



--
-- Name: consume_geo_quota(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.consume_geo_quota(p_user_cap integer DEFAULT 40, p_global_cap integer DEFAULT 2400) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'America/New_York')::date;
  g int;
  u int;
begin
  if uid is null then return 'unauthenticated'; end if;

  insert into geo_usage_global (day, calls) values (today, 0) on conflict (day) do nothing;
  select calls into g from geo_usage_global where day = today for update;
  if g >= p_global_cap then return 'global_limit'; end if;

  insert into geo_usage (day, user_id, calls) values (today, uid, 0) on conflict (day, user_id) do nothing;
  select calls into u from geo_usage where day = today and user_id = uid for update;
  if u >= p_user_cap then return 'user_limit'; end if;

  update geo_usage set calls = calls + 1 where day = today and user_id = uid;
  update geo_usage_global set calls = calls + 1 where day = today;
  return 'ok';
end $$;


--
-- Name: enforce_row_cap(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_row_cap() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $_$
declare
  cap int := tg_argv[0]::int;
  n   int;
begin
  execute format('select count(*) from %I where user_id = $1', tg_table_name)
    into n using new.user_id;
  if n >= cap then
    raise exception 'LIMIT_REACHED: max % rows in %', cap, tg_table_name
      using errcode = 'P0001';
  end if;
  return new;
end $_$;


--
-- Name: get_establishments_for_violation(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_establishments_for_violation(p_violation_desc text, p_since_date text DEFAULT NULL::text) RETURNS TABLE(establishment_id text, premise_name text, address text, score_recent integer, inspection_date_recent date)
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT DISTINCT ON (iv.establishment_id)
    iv.establishment_id,
    f.name               AS premise_name,
    f.address,
    feed.score_recent,
    feed.inspection_date_recent
  FROM public.inspection_violations iv
  JOIN public.facilities f
    ON f.establishment_id = iv.establishment_id
  LEFT JOIN public.v_facility_map_feed feed
    ON feed.establishment_id = iv.establishment_id
  WHERE
    iv.violation_desc = p_violation_desc
    AND (p_since_date IS NULL OR iv.inspection_date >= p_since_date::date)
  ORDER BY iv.establishment_id, iv.inspection_date DESC
  LIMIT 50;
$$;


--
-- Name: get_violation_flags(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_violation_flags() RETURNS TABLE(establishment_id text, has_critical boolean, has_any boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT
    latest.establishment_id,
    COALESCE(bool_or(iv.critical_yn ILIKE 'y%'), false) AS has_critical,
    COALESCE(COUNT(iv.violation_oid) > 0, false)        AS has_any
  FROM (
    -- Most recent inspection per establishment
    SELECT DISTINCT ON (establishment_id)
      establishment_id,
      inspection_id
    FROM public.inspections
    ORDER BY establishment_id, inspection_date DESC, inspection_id DESC
  ) latest
  LEFT JOIN public.inspection_violations iv
    ON iv.inspection_id = latest.inspection_id
  GROUP BY latest.establishment_id;
$$;


--
-- Name: get_violation_summary(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_violation_summary(since_date text DEFAULT NULL::text) RETURNS TABLE(violation_desc text, critical_yn text, cnt bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT
    iv.violation_desc,
    iv.critical_yn,
    COUNT(*) AS cnt
  FROM public.inspection_violations iv
  WHERE
    iv.violation_desc IS NOT NULL
    AND (since_date IS NULL OR iv.inspection_date >= since_date::date)
  GROUP BY iv.violation_desc, iv.critical_yn
  ORDER BY cnt DESC;
$$;


--
-- Name: get_whats_new(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_whats_new(limit_n integer DEFAULT 20) RETURNS TABLE(establishment_id text, premise_name text, address text, score integer, grade text, inspection_date date, critical_count bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  WITH recent AS (
    SELECT
      i.inspection_id,
      i.establishment_id,
      f.name            AS premise_name,
      f.address,
      i.score,
      i.grade,
      i.inspection_date,
      COUNT(CASE WHEN iv.critical_yn ILIKE 'y%' THEN 1 END) AS critical_count
    FROM public.inspections i
    JOIN public.facilities f ON f.establishment_id = i.establishment_id
    LEFT JOIN public.inspection_violations iv ON iv.inspection_id = i.inspection_id
    WHERE i.inspection_date >= (CURRENT_DATE - INTERVAL '30 days')
      AND f.active = true
    GROUP BY i.inspection_id, i.establishment_id, f.name, f.address, i.score, i.grade, i.inspection_date
  )
  SELECT
    establishment_id,
    premise_name,
    address,
    score,
    grade,
    inspection_date,
    critical_count
  FROM recent
  ORDER BY
    CASE WHEN score < 85 OR critical_count > 0 THEN 0 ELSE 1 END,
    inspection_date DESC
  LIMIT limit_n;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_catalog'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$;


--
-- Name: sync_lonlat_from_geom(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_lonlat_from_geom() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_catalog'
    AS $$
BEGIN
  IF NEW.geom IS NOT NULL THEN
    NEW.lon := ST_X(NEW.geom::geometry);
    NEW.lat := ST_Y(NEW.geom::geometry);
  END IF;
  RETURN NEW;
END
$$;


--
-- Name: watch_zone_places(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.watch_zone_places(p_area_id uuid) RETURNS TABLE(establishment_id text, name text, address text, city text, lat double precision, lon double precision, distance_mi numeric, inspection_date date, score integer, grade text, critical_6mo integer, failing boolean)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  with a as (
    select center_lat, center_lon, radius_miles
    from watchlist_areas
    where id = p_area_id
  ),
  near as (
    select
      f.establishment_id, f.name, f.address, f.city, f.lat, f.lon,
      2 * 3958.8 * asin(sqrt(
        power(sin(radians(f.lat - a.center_lat) / 2), 2) +
        cos(radians(a.center_lat)) * cos(radians(f.lat)) *
        power(sin(radians(f.lon - a.center_lon) / 2), 2)
      )) as dist,
      a.radius_miles
    from facilities f
    cross join a
    where f.lat is not null and f.lon is not null
      and f.lat between a.center_lat - a.radius_miles / 69.0 and a.center_lat + a.radius_miles / 69.0
      and f.lon between a.center_lon - a.radius_miles / 55.0 and a.center_lon + a.radius_miles / 55.0
  )
  select
    n.establishment_id,
    n.name,
    n.address,
    n.city,
    n.lat,
    n.lon,
    round(n.dist::numeric, 2),
    li.inspection_date,
    li.score,
    li.grade,
    coalesce(c.cnt, 0)::int,
    (upper(coalesce(li.grade, '')) in ('C', 'F') or coalesce(c.cnt, 0) > 0)
  from near n
  left join lateral (
    select i.inspection_date, i.score, i.grade
    from inspections i
    where i.establishment_id = n.establishment_id
    order by i.inspection_date desc, i.inspection_id desc
    limit 1
  ) li on true
  left join lateral (
    select count(*) as cnt
    from inspection_violations v
    where v.establishment_id = n.establishment_id
      and v.inspection_date > current_date - interval '6 months'
      and left(lower(v.critical_yn::text), 1) = 'y'
  ) c on true
  where n.dist <= n.radius_miles
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: facilities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.facilities (
    establishment_id text NOT NULL,
    permit_number text,
    name text,
    address text,
    city text,
    state text,
    zip text,
    name_search text,
    addr_search text,
    facility_type integer,
    subtype integer,
    loc_source text,
    is_approximate boolean DEFAULT false,
    geom public.geography(Point,4326),
    lon double precision GENERATED ALWAYS AS (public.st_x((geom)::public.geometry)) STORED,
    lat double precision GENERATED ALWAYS AS (public.st_y((geom)::public.geometry)) STORED,
    geocode_provider text,
    geocode_confidence numeric,
    geocode_meta jsonb,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    opening_date date,
    CONSTRAINT facilities_loc_source_check CHECK ((loc_source = ANY (ARRAY['legacy'::text, 'foodmapping'::text, 'nominatim'::text, 'census'::text])))
);


--
-- Name: facility_aliases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.facility_aliases (
    alias_id bigint NOT NULL,
    establishment_id text NOT NULL,
    name text,
    address text,
    source text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: facility_aliases_alias_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.facility_aliases_alias_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: facility_aliases_alias_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.facility_aliases_alias_id_seq OWNED BY public.facility_aliases.alias_id;


--
-- Name: facility_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.facility_categories (
    facility_type integer NOT NULL,
    subtype integer NOT NULL,
    facility_type_description text,
    subtype_description text
);


--
-- Name: feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feedback (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    name text,
    email text,
    feedback_type text NOT NULL,
    message text NOT NULL,
    user_agent text,
    ip_hash text,
    CONSTRAINT feedback_email_check CHECK ((char_length(email) <= 120)),
    CONSTRAINT feedback_feedback_type_check CHECK ((feedback_type = ANY (ARRAY['bug'::text, 'wrong_data'::text, 'feature'::text, 'general'::text]))),
    CONSTRAINT feedback_ip_hash_check CHECK ((char_length(ip_hash) <= 64)),
    CONSTRAINT feedback_message_check CHECK (((char_length(message) >= 10) AND (char_length(message) <= 1200))),
    CONSTRAINT feedback_name_check CHECK ((char_length(name) <= 80)),
    CONSTRAINT feedback_user_agent_check CHECK ((char_length(user_agent) <= 300))
);


--
-- Name: TABLE feedback; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.feedback IS 'User-submitted feedback from Louisville Food Safe. Anon INSERT only via RLS. Read via Supabase dashboard or service-role key.';


--
-- Name: feedback_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.feedback_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: feedback_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.feedback_id_seq OWNED BY public.feedback.id;


--
-- Name: geo_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.geo_usage (
    day date NOT NULL,
    user_id uuid NOT NULL,
    calls integer DEFAULT 0 NOT NULL
);


--
-- Name: geo_usage_global; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.geo_usage_global (
    day date NOT NULL,
    calls integer DEFAULT 0 NOT NULL
);


--
-- Name: geocode_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.geocode_cache (
    key text NOT NULL,
    lon double precision,
    lat double precision,
    provider text,
    confidence numeric,
    meta jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: import_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_runs (
    run_id bigint NOT NULL,
    source text,
    started_at timestamp with time zone DEFAULT now(),
    finished_at timestamp with time zone,
    rows_read integer,
    rows_upserted integer,
    notes jsonb
);


--
-- Name: import_runs_run_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.import_runs_run_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: import_runs_run_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.import_runs_run_id_seq OWNED BY public.import_runs.run_id;


--
-- Name: inspection_violations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inspection_violations (
    violation_oid bigint NOT NULL,
    inspection_id bigint,
    establishment_id text,
    inspection_date date,
    score integer,
    ins_type_desc text,
    insp_type_specific_viol_id bigint,
    violation_desc text,
    critical_yn text,
    insp_viol_comments text,
    rpt_area_id text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: inspections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inspections (
    inspection_id bigint NOT NULL,
    establishment_id text NOT NULL,
    ins_type_desc text,
    inspection_date date NOT NULL,
    score integer,
    grade text,
    raw jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT inspections_score_check CHECK (((score >= 0) AND (score <= 100)))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text,
    display_name text,
    alert_email text,
    alert_frequency text DEFAULT 'instant'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT profiles_alert_frequency_check CHECK ((alert_frequency = ANY (ARRAY['instant'::text, 'daily'::text, 'weekly'::text])))
);


--
-- Name: v_facility_details; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_facility_details AS
 SELECT f.establishment_id,
    f.opening_date,
    f.facility_type,
    f.subtype,
    f.address,
    f.city,
    f.state,
    f.zip,
    f.permit_number,
    f.name,
    fc.facility_type_description,
    fc.subtype_description
   FROM (public.facilities f
     LEFT JOIN public.facility_categories fc ON (((fc.facility_type = f.facility_type) AND (fc.subtype = f.subtype))));


--
-- Name: v_latest_inspection; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_latest_inspection WITH (security_invoker='true') AS
 WITH ranked AS (
         SELECT i.inspection_id,
            i.establishment_id,
            i.ins_type_desc,
            i.inspection_date,
            i.score,
            i.grade,
            i.raw,
            i.created_at,
            row_number() OVER (PARTITION BY i.establishment_id ORDER BY i.inspection_date DESC, i.score DESC, i.inspection_id DESC) AS rn
           FROM public.inspections i
          WHERE ((COALESCE(i.score, 0) > 0) AND (COALESCE(i.ins_type_desc, ''::text) !~~* '%survey%'::text))
        )
 SELECT inspection_id,
    establishment_id,
    ins_type_desc,
    inspection_date,
    score,
    grade,
    raw,
    created_at,
    rn
   FROM ranked
  WHERE (rn = 1);


--
-- Name: v_facility_map_feed; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_facility_map_feed WITH (security_invoker='true') AS
 SELECT f.establishment_id,
    f.name AS premise_name,
    f.address,
    f.lon,
    f.lat,
    li.inspection_date AS inspection_date_recent,
    li.score AS score_recent,
    li.grade AS grade_recent
   FROM (public.facilities f
     LEFT JOIN public.v_latest_inspection li USING (establishment_id))
  WHERE ((f.lon IS NOT NULL) AND (f.lat IS NOT NULL));


--
-- Name: v_inspection_table; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_inspection_table WITH (security_invoker='true') AS
 SELECT i.inspection_id,
    i.establishment_id,
    i.inspection_date,
    i.score,
    i.grade,
    i.ins_type_desc,
    f.name,
    f.address,
    f.zip
   FROM (public.inspections i
     LEFT JOIN public.facilities f USING (establishment_id));


--
-- Name: v_inspection_types; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_inspection_types WITH (security_invoker='true') AS
 SELECT ins_type_desc,
    count(*) AS cnt
   FROM public.inspections
  WHERE (ins_type_desc IS NOT NULL)
  GROUP BY ins_type_desc
  ORDER BY (count(*)) DESC;


--
-- Name: v_latest_insp_per_type; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_latest_insp_per_type WITH (security_invoker='true') AS
 SELECT DISTINCT ON (establishment_id, ins_type_desc) inspection_id,
    establishment_id,
    inspection_date,
    score,
    grade,
    ins_type_desc,
    name,
    address,
    zip
   FROM public.v_inspection_table
  WHERE (ins_type_desc IS NOT NULL)
  ORDER BY establishment_id, ins_type_desc, inspection_date DESC, inspection_id DESC;


--
-- Name: watchlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.watchlist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    establishment_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: v_watchlist_with_latest; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_watchlist_with_latest AS
 SELECT w.id,
    w.user_id,
    w.establishment_id,
    f.name,
    f.address,
    f.city,
    li.inspection_date,
    li.score,
    li.grade,
    COALESCE(c.critical_6mo, (0)::bigint) AS critical_6mo
   FROM (((public.watchlist w
     JOIN public.facilities f ON ((f.establishment_id = w.establishment_id)))
     LEFT JOIN LATERAL ( SELECT inspections.inspection_date,
            inspections.score,
            inspections.grade
           FROM public.inspections
          WHERE (inspections.establishment_id = w.establishment_id)
          ORDER BY inspections.inspection_date DESC, inspections.inspection_id DESC
         LIMIT 1) li ON (true))
     LEFT JOIN LATERAL ( SELECT count(*) AS critical_6mo
           FROM public.inspection_violations v
          WHERE ((v.establishment_id = w.establishment_id) AND (v.inspection_date > (CURRENT_DATE - '6 mons'::interval)) AND ("left"(lower(v.critical_yn), 1) = 'y'::text))) c ON (true))
  WHERE (w.user_id = auth.uid());


--
-- Name: v_zip_codes; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_zip_codes WITH (security_invoker='true') AS
 SELECT DISTINCT zip
   FROM public.facilities
  WHERE ((zip IS NOT NULL) AND (zip <> ''::text))
  ORDER BY zip;


--
-- Name: violation_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.violation_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    keyword text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: watchlist_areas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.watchlist_areas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    label text,
    center_address text,
    center_lat double precision NOT NULL,
    center_lon double precision NOT NULL,
    radius_miles integer DEFAULT 5 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT watchlist_areas_bounds CHECK ((((center_lat >= (37.8)::double precision) AND (center_lat <= (38.6)::double precision)) AND ((center_lon >= ('-86.3'::numeric)::double precision) AND (center_lon <= ('-85.1'::numeric)::double precision)))),
    CONSTRAINT watchlist_areas_radius CHECK (((radius_miles >= 1) AND (radius_miles <= 25)))
);


--
-- Name: facility_aliases alias_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facility_aliases ALTER COLUMN alias_id SET DEFAULT nextval('public.facility_aliases_alias_id_seq'::regclass);


--
-- Name: feedback id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback ALTER COLUMN id SET DEFAULT nextval('public.feedback_id_seq'::regclass);


--
-- Name: import_runs run_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_runs ALTER COLUMN run_id SET DEFAULT nextval('public.import_runs_run_id_seq'::regclass);


--
-- Name: facilities facilities_permit_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facilities
    ADD CONSTRAINT facilities_permit_number_key UNIQUE (permit_number);


--
-- Name: facilities facilities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facilities
    ADD CONSTRAINT facilities_pkey PRIMARY KEY (establishment_id);


--
-- Name: facility_aliases facility_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facility_aliases
    ADD CONSTRAINT facility_aliases_pkey PRIMARY KEY (alias_id);


--
-- Name: facility_categories facility_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facility_categories
    ADD CONSTRAINT facility_categories_pkey PRIMARY KEY (facility_type, subtype);


--
-- Name: feedback feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_pkey PRIMARY KEY (id);


--
-- Name: geo_usage_global geo_usage_global_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.geo_usage_global
    ADD CONSTRAINT geo_usage_global_pkey PRIMARY KEY (day);


--
-- Name: geo_usage geo_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.geo_usage
    ADD CONSTRAINT geo_usage_pkey PRIMARY KEY (day, user_id);


--
-- Name: geocode_cache geocode_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.geocode_cache
    ADD CONSTRAINT geocode_cache_pkey PRIMARY KEY (key);


--
-- Name: import_runs import_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_runs
    ADD CONSTRAINT import_runs_pkey PRIMARY KEY (run_id);


--
-- Name: inspection_violations inspection_violations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspection_violations
    ADD CONSTRAINT inspection_violations_pkey PRIMARY KEY (violation_oid);


--
-- Name: inspections inspections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspections
    ADD CONSTRAINT inspections_pkey PRIMARY KEY (inspection_id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: violation_alerts violation_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.violation_alerts
    ADD CONSTRAINT violation_alerts_pkey PRIMARY KEY (id);


--
-- Name: violation_alerts violation_alerts_user_id_keyword_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.violation_alerts
    ADD CONSTRAINT violation_alerts_user_id_keyword_key UNIQUE (user_id, keyword);


--
-- Name: watchlist_areas watchlist_areas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watchlist_areas
    ADD CONSTRAINT watchlist_areas_pkey PRIMARY KEY (id);


--
-- Name: watchlist watchlist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watchlist
    ADD CONSTRAINT watchlist_pkey PRIMARY KEY (id);


--
-- Name: watchlist watchlist_user_id_establishment_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watchlist
    ADD CONSTRAINT watchlist_user_id_establishment_id_key UNIQUE (user_id, establishment_id);


--
-- Name: facilities_addr_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX facilities_addr_gin ON public.facilities USING gin (addr_search public.gin_trgm_ops);


--
-- Name: facilities_establishment_id_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX facilities_establishment_id_uidx ON public.facilities USING btree (establishment_id);


--
-- Name: facilities_geom_gix; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX facilities_geom_gix ON public.facilities USING gist (geom);


--
-- Name: facilities_name_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX facilities_name_gin ON public.facilities USING gin (name_search public.gin_trgm_ops);


--
-- Name: facility_aliases_establishment_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX facility_aliases_establishment_id_idx ON public.facility_aliases USING btree (establishment_id);


--
-- Name: feedback_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feedback_created_at_idx ON public.feedback USING btree (created_at DESC);


--
-- Name: feedback_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feedback_type_idx ON public.feedback USING btree (feedback_type);


--
-- Name: idx_facilities_opening_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_facilities_opening_date ON public.facilities USING btree (opening_date);


--
-- Name: idx_insp_viol_by_eid_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_insp_viol_by_eid_date ON public.inspection_violations USING btree (establishment_id, inspection_date);


--
-- Name: idx_insp_viol_by_inspid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_insp_viol_by_inspid ON public.inspection_violations USING btree (inspection_id);


--
-- Name: inspections_est_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inspections_est_idx ON public.inspections USING btree (establishment_id, inspection_date DESC);


--
-- Name: inspections_establishment_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inspections_establishment_id_idx ON public.inspections USING btree (establishment_id);


--
-- Name: inspections_inspection_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inspections_inspection_date_idx ON public.inspections USING btree (inspection_date DESC);


--
-- Name: watchlist cap_watchlist; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cap_watchlist BEFORE INSERT ON public.watchlist FOR EACH ROW EXECUTE FUNCTION public.enforce_row_cap('30');


--
-- Name: watchlist_areas cap_watchlist_areas; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cap_watchlist_areas BEFORE INSERT ON public.watchlist_areas FOR EACH ROW EXECUTE FUNCTION public.enforce_row_cap('3');


--
-- Name: facilities trg_facilities_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_facilities_updated_at BEFORE UPDATE ON public.facilities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: facilities trg_sync_lonlat; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_lonlat BEFORE INSERT OR UPDATE ON public.facilities FOR EACH ROW EXECUTE FUNCTION public.sync_lonlat_from_geom();


--
-- Name: facilities facilities_category_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facilities
    ADD CONSTRAINT facilities_category_fk FOREIGN KEY (facility_type, subtype) REFERENCES public.facility_categories(facility_type, subtype);


--
-- Name: facility_aliases facility_aliases_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facility_aliases
    ADD CONSTRAINT facility_aliases_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.facilities(establishment_id) ON DELETE CASCADE;


--
-- Name: inspections inspections_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspections
    ADD CONSTRAINT inspections_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.facilities(establishment_id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: violation_alerts violation_alerts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.violation_alerts
    ADD CONSTRAINT violation_alerts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: watchlist_areas watchlist_areas_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watchlist_areas
    ADD CONSTRAINT watchlist_areas_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: watchlist watchlist_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watchlist
    ADD CONSTRAINT watchlist_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.facilities(establishment_id) ON DELETE CASCADE;


--
-- Name: watchlist watchlist_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watchlist
    ADD CONSTRAINT watchlist_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: facility_aliases Public read access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read access" ON public.facility_aliases FOR SELECT TO authenticated, anon USING (true);


--
-- Name: facility_categories Public read access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read access" ON public.facility_categories FOR SELECT TO authenticated, anon USING (true);


--
-- Name: geocode_cache Public read access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read access" ON public.geocode_cache FOR SELECT TO authenticated, anon USING (true);


--
-- Name: import_runs Public read access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read access" ON public.import_runs FOR SELECT TO authenticated, anon USING (true);


--
-- Name: violation_alerts alerts_all_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY alerts_all_own ON public.violation_alerts USING ((auth.uid() = user_id));


--
-- Name: violation_alerts alerts_service_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY alerts_service_read ON public.violation_alerts FOR SELECT TO service_role USING (true);


--
-- Name: feedback anon_can_insert_feedback; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_can_insert_feedback ON public.feedback FOR INSERT TO anon WITH CHECK (true);


--
-- Name: watchlist_areas areas_all_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY areas_all_own ON public.watchlist_areas USING ((auth.uid() = user_id));


--
-- Name: watchlist_areas areas_service_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY areas_service_read ON public.watchlist_areas FOR SELECT TO service_role USING (true);


--
-- Name: feedback auth_can_read_feedback; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY auth_can_read_feedback ON public.feedback FOR SELECT TO authenticated USING (true);


--
-- Name: facilities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.facilities ENABLE ROW LEVEL SECURITY;

--
-- Name: facilities facilities_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY facilities_read ON public.facilities FOR SELECT USING (true);


--
-- Name: facility_aliases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.facility_aliases ENABLE ROW LEVEL SECURITY;

--
-- Name: facility_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.facility_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: feedback; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

--
-- Name: geo_usage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.geo_usage ENABLE ROW LEVEL SECURITY;

--
-- Name: geo_usage_global; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.geo_usage_global ENABLE ROW LEVEL SECURITY;

--
-- Name: geocode_cache; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.geocode_cache ENABLE ROW LEVEL SECURITY;

--
-- Name: import_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.import_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: inspection_violations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inspection_violations ENABLE ROW LEVEL SECURITY;

--
-- Name: inspections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;

--
-- Name: inspections inspections_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inspections_read ON public.inspections FOR SELECT USING (true);


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = id));


--
-- Name: profiles profiles_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_own ON public.profiles FOR SELECT USING ((auth.uid() = id));


--
-- Name: profiles profiles_service_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_service_read ON public.profiles FOR SELECT TO service_role USING (true);


--
-- Name: profiles profiles_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE USING ((auth.uid() = id));


--
-- Name: inspection_violations public read inspection_violations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "public read inspection_violations" ON public.inspection_violations FOR SELECT USING (true);


--
-- Name: violation_alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.violation_alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: watchlist; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;

--
-- Name: watchlist watchlist_all_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY watchlist_all_own ON public.watchlist USING ((auth.uid() = user_id));


--
-- Name: watchlist_areas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.watchlist_areas ENABLE ROW LEVEL SECURITY;

--
-- Name: watchlist watchlist_service_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY watchlist_service_read ON public.watchlist FOR SELECT TO service_role USING (true);


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION consume_geo_quota(p_user_cap integer, p_global_cap integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.consume_geo_quota(p_user_cap integer, p_global_cap integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.consume_geo_quota(p_user_cap integer, p_global_cap integer) TO authenticated;
GRANT ALL ON FUNCTION public.consume_geo_quota(p_user_cap integer, p_global_cap integer) TO service_role;


--
-- Name: FUNCTION enforce_row_cap(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.enforce_row_cap() TO anon;
GRANT ALL ON FUNCTION public.enforce_row_cap() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_row_cap() TO service_role;


--
-- Name: FUNCTION get_establishments_for_violation(p_violation_desc text, p_since_date text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_establishments_for_violation(p_violation_desc text, p_since_date text) TO anon;
GRANT ALL ON FUNCTION public.get_establishments_for_violation(p_violation_desc text, p_since_date text) TO authenticated;
GRANT ALL ON FUNCTION public.get_establishments_for_violation(p_violation_desc text, p_since_date text) TO service_role;


--
-- Name: FUNCTION get_violation_flags(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_violation_flags() TO anon;
GRANT ALL ON FUNCTION public.get_violation_flags() TO authenticated;
GRANT ALL ON FUNCTION public.get_violation_flags() TO service_role;


--
-- Name: FUNCTION get_violation_summary(since_date text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_violation_summary(since_date text) TO anon;
GRANT ALL ON FUNCTION public.get_violation_summary(since_date text) TO authenticated;
GRANT ALL ON FUNCTION public.get_violation_summary(since_date text) TO service_role;


--
-- Name: FUNCTION get_whats_new(limit_n integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_whats_new(limit_n integer) TO anon;
GRANT ALL ON FUNCTION public.get_whats_new(limit_n integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_whats_new(limit_n integer) TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION set_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;


--
-- Name: FUNCTION sync_lonlat_from_geom(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_lonlat_from_geom() TO anon;
GRANT ALL ON FUNCTION public.sync_lonlat_from_geom() TO authenticated;
GRANT ALL ON FUNCTION public.sync_lonlat_from_geom() TO service_role;


--
-- Name: FUNCTION watch_zone_places(p_area_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.watch_zone_places(p_area_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.watch_zone_places(p_area_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.watch_zone_places(p_area_id uuid) TO service_role;


--
-- Name: TABLE facilities; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.facilities TO anon;
GRANT ALL ON TABLE public.facilities TO authenticated;
GRANT ALL ON TABLE public.facilities TO service_role;


--
-- Name: TABLE facility_aliases; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.facility_aliases TO anon;
GRANT ALL ON TABLE public.facility_aliases TO authenticated;
GRANT ALL ON TABLE public.facility_aliases TO service_role;


--
-- Name: SEQUENCE facility_aliases_alias_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.facility_aliases_alias_id_seq TO anon;
GRANT ALL ON SEQUENCE public.facility_aliases_alias_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.facility_aliases_alias_id_seq TO service_role;


--
-- Name: TABLE facility_categories; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.facility_categories TO anon;
GRANT ALL ON TABLE public.facility_categories TO authenticated;
GRANT ALL ON TABLE public.facility_categories TO service_role;


--
-- Name: TABLE feedback; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.feedback TO anon;
GRANT ALL ON TABLE public.feedback TO authenticated;
GRANT ALL ON TABLE public.feedback TO service_role;


--
-- Name: SEQUENCE feedback_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.feedback_id_seq TO anon;
GRANT ALL ON SEQUENCE public.feedback_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.feedback_id_seq TO service_role;


--
-- Name: TABLE geo_usage; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.geo_usage TO anon;
GRANT ALL ON TABLE public.geo_usage TO authenticated;
GRANT ALL ON TABLE public.geo_usage TO service_role;


--
-- Name: TABLE geo_usage_global; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.geo_usage_global TO anon;
GRANT ALL ON TABLE public.geo_usage_global TO authenticated;
GRANT ALL ON TABLE public.geo_usage_global TO service_role;


--
-- Name: TABLE geocode_cache; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.geocode_cache TO anon;
GRANT ALL ON TABLE public.geocode_cache TO authenticated;
GRANT ALL ON TABLE public.geocode_cache TO service_role;


--
-- Name: TABLE import_runs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.import_runs TO anon;
GRANT ALL ON TABLE public.import_runs TO authenticated;
GRANT ALL ON TABLE public.import_runs TO service_role;


--
-- Name: SEQUENCE import_runs_run_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.import_runs_run_id_seq TO anon;
GRANT ALL ON SEQUENCE public.import_runs_run_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.import_runs_run_id_seq TO service_role;


--
-- Name: TABLE inspection_violations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.inspection_violations TO anon;
GRANT ALL ON TABLE public.inspection_violations TO authenticated;
GRANT ALL ON TABLE public.inspection_violations TO service_role;


--
-- Name: TABLE inspections; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.inspections TO anon;
GRANT ALL ON TABLE public.inspections TO authenticated;
GRANT ALL ON TABLE public.inspections TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE v_facility_details; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_facility_details TO anon;
GRANT ALL ON TABLE public.v_facility_details TO authenticated;
GRANT ALL ON TABLE public.v_facility_details TO service_role;


--
-- Name: TABLE v_latest_inspection; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_latest_inspection TO anon;
GRANT ALL ON TABLE public.v_latest_inspection TO authenticated;
GRANT ALL ON TABLE public.v_latest_inspection TO service_role;


--
-- Name: TABLE v_facility_map_feed; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_facility_map_feed TO anon;
GRANT ALL ON TABLE public.v_facility_map_feed TO authenticated;
GRANT ALL ON TABLE public.v_facility_map_feed TO service_role;


--
-- Name: TABLE v_inspection_table; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_inspection_table TO anon;
GRANT ALL ON TABLE public.v_inspection_table TO authenticated;
GRANT ALL ON TABLE public.v_inspection_table TO service_role;


--
-- Name: TABLE v_inspection_types; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_inspection_types TO anon;
GRANT ALL ON TABLE public.v_inspection_types TO authenticated;
GRANT ALL ON TABLE public.v_inspection_types TO service_role;


--
-- Name: TABLE v_latest_insp_per_type; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_latest_insp_per_type TO anon;
GRANT ALL ON TABLE public.v_latest_insp_per_type TO authenticated;
GRANT ALL ON TABLE public.v_latest_insp_per_type TO service_role;


--
-- Name: TABLE watchlist; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.watchlist TO anon;
GRANT ALL ON TABLE public.watchlist TO authenticated;
GRANT ALL ON TABLE public.watchlist TO service_role;


--
-- Name: TABLE v_watchlist_with_latest; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_watchlist_with_latest TO authenticated;
GRANT ALL ON TABLE public.v_watchlist_with_latest TO service_role;


--
-- Name: TABLE v_zip_codes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_zip_codes TO anon;
GRANT ALL ON TABLE public.v_zip_codes TO authenticated;
GRANT ALL ON TABLE public.v_zip_codes TO service_role;


--
-- Name: TABLE violation_alerts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.violation_alerts TO anon;
GRANT ALL ON TABLE public.violation_alerts TO authenticated;
GRANT ALL ON TABLE public.violation_alerts TO service_role;


--
-- Name: TABLE watchlist_areas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.watchlist_areas TO anon;
GRANT ALL ON TABLE public.watchlist_areas TO authenticated;
GRANT ALL ON TABLE public.watchlist_areas TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict LLW5sTIZ7G9C7hg5VQIUKVee0iufENcsCCsTswJUIwcbQtdd7w4ZqS0Z76PRvuO

