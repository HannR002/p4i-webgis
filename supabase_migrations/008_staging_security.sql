-- Phase 08: additive hardening, after the verified foundation and historical 007.
-- No foundation is inferred here. Test on disposable staging before any release.
BEGIN;

-- The remaining PostGIS SECURITY DEFINER functions use public in search_path.
-- Browser identities must never be able to create shadow objects there.
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;

-- PUBLIC privileges are inherited by every role; revoking only named roles is insufficient.
DO $privileges$
DECLARE
    target TEXT;
BEGIN
    FOREACH target IN ARRAY ARRAY[
        'user_profiles', 'spatial_projects', 'vector_layers', 'b2b_entitlements',
        'audit_logs', 'sales_leads', 'download_history', 'administrative_boundaries',
        'administrative_boundaries_import_staging', 'flood_analysis_results',
        'analysis_reports', 'smce_criteria_weights', 'vw_vector_layers_geojson',
        'vw_spatial_projects'
    ] LOOP
        IF pg_catalog.to_regclass(pg_catalog.format('public.%I', target)) IS NOT NULL THEN
            EXECUTE pg_catalog.format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', target);
        END IF;
    END LOOP;
END;
$privileges$;

GRANT SELECT ON public.spatial_projects, public.vector_layers TO anon, authenticated;
GRANT SELECT ON public.b2b_entitlements, public.flood_analysis_results TO authenticated;

-- Historical report DDL/publication semantics are unknown. A project entitlement
-- alone is not authorization to release every draft report from that project.
-- Keep legacy reports service-only until a reviewed publication mapping exists.
-- Phase 07's independent, versioned development workflow is unaffected.
DO $children$
DECLARE target TEXT;
BEGIN
    FOREACH target IN ARRAY ARRAY['analysis_reports', 'smce_criteria_weights'] LOOP
        IF pg_catalog.to_regclass(pg_catalog.format('public.%I', target)) IS NOT NULL THEN
            EXECUTE pg_catalog.format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target);
            EXECUTE pg_catalog.format('GRANT ALL ON TABLE public.%I TO service_role', target);
        END IF;
    END LOOP;
END;
$children$;

-- Reset policies as legacy permissive policies combine with OR.
DO $downloads$
DECLARE policy RECORD;
BEGIN
    FOR policy IN SELECT polname FROM pg_catalog.pg_policy
        WHERE polrelid = 'public.download_history'::regclass
    LOOP
        EXECUTE pg_catalog.format('DROP POLICY %I ON public.download_history', policy.polname);
    END LOOP;
END;
$downloads$;
ALTER TABLE public.download_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY p4i_downloads_read_own_entitled ON public.download_history
FOR SELECT TO authenticated USING (
    client_user_id = (SELECT auth.uid())
    AND public.get_current_user_role() IS NOT NULL
    AND public.can_access_project(project_id)
);
GRANT SELECT ON public.download_history TO authenticated;

-- Clients with disabled/missing profiles must not retain entitlement metadata access.
DROP POLICY IF EXISTS p4i_entitlements_read_own_or_super_admin ON public.b2b_entitlements;
CREATE POLICY p4i_entitlements_read_own_or_super_admin ON public.b2b_entitlements
FOR SELECT TO authenticated USING (
    public.get_current_user_role() IS NOT NULL
    AND (client_user_id = (SELECT auth.uid())
         OR public.get_current_user_role() = 'super_admin'::public.user_role)
);

REVOKE ALL ON SEQUENCE public.administrative_boundaries_import_staging_id_seq
    FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.administrative_boundaries_import_staging_id_seq TO service_role;

-- Modern PostgREST carries one request.jwt.claims JSON object. auth.uid() is
-- the provider identity adapter; never trust editable role metadata for auditing.
CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE actor UUID;
BEGIN
    actor := (SELECT auth.uid());
    -- Anonymous/server writes have no end-user identity. Do not fabricate one.
    INSERT INTO public.audit_logs (user_id, action_type, table_name, record_id, ip_address, metadata)
    VALUES (actor, TG_OP, TG_TABLE_NAME,
        CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
        NULLIF(pg_catalog.current_setting('request.ip_address', true), ''),
        CASE WHEN TG_OP = 'DELETE' THEN pg_catalog.to_jsonb(OLD) ELSE pg_catalog.to_jsonb(NEW) END);
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;
ALTER FUNCTION public.audit_trigger_fn() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.audit_trigger_fn() FROM PUBLIC, anon, authenticated;

-- Harden defaults for subsequent postgres-owned application objects. Explicit
-- grants are required in each future migration; existing PostGIS functions stay intact.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
COMMIT;
