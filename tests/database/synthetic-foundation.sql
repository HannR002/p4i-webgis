-- TEST FIXTURE ONLY. NOT a recovered live schema and NEVER an external migration.
-- Deliberately minimal contracts to execute real historical SQL and RLS tests.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE ROLE authenticator LOGIN NOINHERIT;
GRANT anon, authenticated, service_role TO authenticator;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, raw_user_meta_data jsonb DEFAULT '{}'::jsonb);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb->>'sub', '')::uuid
$$;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
CREATE TYPE public.user_role AS ENUM ('b2b_client', 'managerial_analyst', 'super_admin');
CREATE TABLE public.user_profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id), full_name text,
    email text, role public.user_role NOT NULL DEFAULT 'b2b_client'
);
CREATE TABLE public.spatial_projects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL,
    category text, description text, access_tier text NOT NULL CHECK (access_tier IN ('public','restricted')),
    created_at timestamptz DEFAULT now()
);
CREATE TABLE public.vector_layers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES public.spatial_projects(id),
    layer_name text, geom public.geometry(Geometry,4326), properties jsonb DEFAULT '{}'::jsonb
);
-- Intentionally no publication column: verifies fail-closed private reports.
CREATE TABLE public.analysis_reports (id uuid PRIMARY KEY, project_id uuid REFERENCES public.spatial_projects(id), body text);
CREATE TABLE public.smce_criteria_weights (id uuid PRIMARY KEY, project_id uuid REFERENCES public.spatial_projects(id), weights jsonb);
CREATE MATERIALIZED VIEW public.vw_vector_layers_geojson AS SELECT id, project_id, ST_AsGeoJSON(geom) FROM public.vector_layers;
CREATE VIEW public.vw_spatial_projects AS SELECT * FROM public.spatial_projects;
CREATE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Fixture signup unavailable until migration 007'; END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
-- Simulate dangerous legacy grants so tests verify revocation, not just defaults.
GRANT ALL ON ALL TABLES IN SCHEMA public TO PUBLIC, anon, authenticated;
GRANT CREATE ON SCHEMA public TO PUBLIC;
