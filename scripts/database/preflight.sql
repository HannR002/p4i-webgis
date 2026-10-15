-- Run before historical replay, after a separately captured/reviewed foundation.
-- Checks executable prerequisites, NOT proof of provenance or external permission.
-- No application rows are returned. Fresh replay only: destructive legacy audit DDL.
BEGIN TRANSACTION READ ONLY;
DO $preflight$
DECLARE item text; requirement record; missing text[] := '{}';
BEGIN
    FOREACH item IN ARRAY ARRAY['user_profiles','spatial_projects','vector_layers','vw_vector_layers_geojson'] LOOP
        IF to_regclass('public.' || item) IS NULL THEN missing := array_append(missing,'public.' || item); END IF;
    END LOOP;
    IF to_regtype('public.user_role') IS NULL THEN missing := array_append(missing,'public.user_role'); END IF;
    IF to_regprocedure('auth.uid()') IS NULL THEN missing := array_append(missing,'auth.uid()'); END IF;
    IF to_regprocedure('public.handle_new_user()') IS NULL THEN missing := array_append(missing,'public.handle_new_user()'); END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='postgis' AND n.nspname='public') THEN
        missing := array_append(missing,'PostGIS in public (historical 007 uses public.ST_AsGeoJSON)');
    END IF;
    FOREACH item IN ARRAY ARRAY['anon','authenticated','service_role','postgres'] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=item) THEN missing := array_append(missing,'role ' || item); END IF;
    END LOOP;
    IF cardinality(missing)>0 THEN RAISE EXCEPTION 'Unverified/missing prerequisites: %',array_to_string(missing,', '); END IF;
    FOR requirement IN SELECT * FROM (VALUES
        ('user_profiles','id','uuid'), ('user_profiles','role','user_role'),
        ('spatial_projects','id','uuid'), ('vector_layers','id','uuid'),
        ('vector_layers','project_id','uuid'), ('vector_layers','geom','geometry'),
        ('vector_layers','properties','jsonb')
    ) AS expected(table_name,column_name,type_name) LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_type t ON t.oid=a.atttypid
            WHERE a.attrelid=to_regclass('public.'||requirement.table_name)
              AND a.attname=requirement.column_name AND NOT a.attisdropped AND t.typname=requirement.type_name) THEN
            RAISE EXCEPTION 'Missing/incompatible %.% type %', requirement.table_name,requirement.column_name,requirement.type_name;
        END IF;
    END LOOP;
    FOREACH item IN ARRAY ARRAY['full_name','role'] LOOP
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_profiles' AND column_name=item) THEN
            RAISE EXCEPTION 'Missing user_profiles.%',item;
        END IF;
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='spatial_projects' AND column_name='access_tier') THEN
        RAISE EXCEPTION 'Missing spatial_projects.access_tier';
    END IF;
    IF (SELECT count(*) FROM pg_enum WHERE enumtypid='public.user_role'::regtype AND enumlabel IN ('b2b_client','managerial_analyst','super_admin')) <> 3 THEN
        RAISE EXCEPTION 'Application enum labels missing';
    END IF;
    IF EXISTS (SELECT 1 FROM public.user_profiles) OR EXISTS (SELECT 1 FROM public.spatial_projects) OR EXISTS (SELECT 1 FROM public.vector_layers) THEN
        RAISE EXCEPTION 'Fresh replay requires empty foundation tables; existing-database upgrade is out of scope';
    END IF;
    IF to_regclass('public.audit_logs') IS NOT NULL THEN
        RAISE EXCEPTION 'Existing audit_logs: refuse historical DROP/CASCADE replay; preserve evidence and design upgrade';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('auth.users') AND tgfoid=to_regprocedure('public.handle_new_user()') AND NOT tgisinternal AND tgenabled<>'D') THEN
        RAISE EXCEPTION 'Verified enabled auth.users signup trigger required';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.vw_vector_layers_geojson'::regclass AND relkind='m') THEN
        RAISE EXCEPTION 'Expected MATERIALIZED VIEW prerequisite for historical 007';
    END IF;
END;
$preflight$;
COMMIT;
