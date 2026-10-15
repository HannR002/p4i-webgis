-- Executable read-only assertions after 008, in addition to metadata inventory.
BEGIN TRANSACTION READ ONLY;
DO $verify$
DECLARE target text; browser text; signature text;
BEGIN
    FOREACH target IN ARRAY ARRAY['user_profiles','spatial_projects','vector_layers',
      'b2b_entitlements','audit_logs','download_history','sales_leads',
      'administrative_boundaries','administrative_boundaries_import_staging','flood_analysis_results'] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid=to_regclass('public.'||target) AND relrowsecurity) THEN
            RAISE EXCEPTION 'Missing RLS on %',target;
        END IF;
        FOREACH browser IN ARRAY ARRAY['anon','authenticated'] LOOP
            IF has_table_privilege(browser,'public.'||target,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
                RAISE EXCEPTION 'Browser mutation grant: % %',browser,target;
            END IF;
        END LOOP;
    END LOOP;
    FOREACH target IN ARRAY ARRAY['user_profiles','audit_logs','sales_leads',
      'administrative_boundaries','administrative_boundaries_import_staging',
      'analysis_reports','smce_criteria_weights','vw_vector_layers_geojson','vw_spatial_projects'] LOOP
        IF to_regclass('public.'||target) IS NOT NULL THEN
            FOREACH browser IN ARRAY ARRAY['anon','authenticated'] LOOP
                IF has_table_privilege(browser,'public.'||target,'SELECT') THEN
                    RAISE EXCEPTION 'Sensitive read grant: % %',browser,target;
                END IF;
            END LOOP;
        END IF;
    END LOOP;
    FOREACH signature IN ARRAY ARRAY['public.handle_new_user()', 'public.audit_trigger_fn()',
      'public.promote_administrative_boundary_import(uuid)',
      'public.get_boundaries_in_view(double precision,double precision,double precision,double precision,text,double precision)',
      'public.get_project_vector_layers_geojson(uuid)'] LOOP
        FOREACH browser IN ARRAY ARRAY['anon','authenticated'] LOOP
            IF has_function_privilege(browser,signature,'EXECUTE') THEN
                RAISE EXCEPTION 'Internal function executable: % %',browser,signature;
            END IF;
        END LOOP;
    END LOOP;
    IF EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname IN ('handle_new_user','get_current_user_role',
          'can_access_project','audit_trigger_fn','get_project_vector_layers_geojson',
          'promote_administrative_boundary_import','get_boundaries_in_view')
          AND (NOT p.prosecdef OR pg_get_userbyid(p.proowner)<>'postgres'
            OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) setting WHERE setting LIKE 'search_path=pg_catalog%'))
    ) THEN RAISE EXCEPTION 'Untrusted SECURITY DEFINER owner/search_path'; END IF;
    FOREACH browser IN ARRAY ARRAY['anon','authenticated'] LOOP
        IF has_schema_privilege(browser,'public','CREATE') THEN RAISE EXCEPTION 'Untrusted schema CREATE: %',browser; END IF;
        IF has_sequence_privilege(browser,'public.administrative_boundaries_import_staging_id_seq','USAGE,SELECT,UPDATE') THEN
            RAISE EXCEPTION 'Untrusted import sequence privilege: %',browser;
        END IF;
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls) THEN
        RAISE EXCEPTION 'Service role expected to bypass RLS; trusted-server checks are mandatory';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_class WHERE oid IN ('public.user_profiles'::regclass,'public.spatial_projects'::regclass,'public.b2b_entitlements'::regclass) AND relforcerowsecurity) THEN
        RAISE EXCEPTION 'Access helper assumes owner bypass (NO FORCE RLS)';
    END IF;
END;
$verify$;
COMMIT;
