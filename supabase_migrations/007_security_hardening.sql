-- P4I provider-abstraction and authorization hardening
-- REVIEW AND TEST IN A NON-PRODUCTION ENVIRONMENT BEFORE APPLYING.
-- This migration has never been executed by the application.
-- Verified live facts incorporated here:
--   * public.vw_vector_layers_geojson is a MATERIALIZED VIEW owned by postgres.
--   * public.handle_new_user() trusted raw_user_meta_data.role (critical).
--   * public.get_current_user_role() trusted user_metadata.role (critical).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Authorization identity: public.user_profiles.role is the only role source
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
    INSERT INTO public.user_profiles (id, full_name, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'User P4I'),
        'b2b_client'::public.user_role
    );
    RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- NULL means unauthenticated, missing profile, disabled account, or no role.
-- It deliberately does not silently treat an anonymous caller as b2b_client.
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
    SELECT profile.role
    FROM public.user_profiles AS profile
    WHERE profile.id = (SELECT auth.uid())
      AND COALESCE(profile.is_disabled, FALSE) = FALSE
    LIMIT 1
$$;

ALTER FUNCTION public.get_current_user_role() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_current_user_role() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_user_role() TO authenticated, service_role;

-- This helper is SECURITY DEFINER specifically to avoid RLS recursion when a
-- project or child-resource policy asks whether its own project is visible.
-- Its postgres owner and NO FORCE RLS tables are required invariants.
CREATE OR REPLACE FUNCTION public.can_access_project(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.spatial_projects AS project
        WHERE project.id = p_project_id
          AND (
              project.access_tier = 'public'
              OR public.get_current_user_role() IN (
                  'managerial_analyst'::public.user_role,
                  'super_admin'::public.user_role
              )
              OR (
                  public.get_current_user_role() = 'b2b_client'::public.user_role
                  AND EXISTS (
                      SELECT 1
                      FROM public.b2b_entitlements AS entitlement
                      WHERE entitlement.client_user_id = (SELECT auth.uid())
                        AND entitlement.project_id = project.id
                  )
              )
          )
    )
$$;

ALTER FUNCTION public.can_access_project(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_access_project(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_project(UUID) TO anon, authenticated, service_role;

-- Role changes are administrative server/database operations only. Even if an
-- old permissive RLS policy remains on user_profiles, browser roles have no DML.
REVOKE ALL PRIVILEGES ON TABLE public.user_profiles FROM anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.user_profiles TO service_role;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles NO FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. Materialized GeoJSON removal from the runtime path
-- ---------------------------------------------------------------------------

-- Materialized rows do not inherit current vector_layers RLS. A normal-view
-- security_invoker option is inapplicable to this object.
REVOKE ALL PRIVILEGES ON TABLE public.vw_vector_layers_geojson
  FROM PUBLIC, anon, authenticated;

-- The application repository now calls this service-role-only function instead
-- of reading the materialized view. Authorization is performed by the API before
-- this function is invoked. It returns current base-table rows, never stale
-- materialized rows.
CREATE OR REPLACE FUNCTION public.get_project_vector_layers_geojson(p_project_id UUID)
RETURNS TABLE (
    id UUID,
    project_id UUID,
    geojson JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
    SELECT
        layer.id,
        layer.project_id,
        pg_catalog.jsonb_build_object(
            'type', 'Feature',
            'id', layer.id,
            'geometry', public.ST_AsGeoJSON(layer.geom)::JSONB,
            'properties', COALESCE(layer.properties, '{}'::JSONB)
        ) AS geojson
    FROM public.vector_layers AS layer
    WHERE layer.project_id = p_project_id
    ORDER BY layer.id
$$;

ALTER FUNCTION public.get_project_vector_layers_geojson(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_project_vector_layers_geojson(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_project_vector_layers_geojson(UUID) TO service_role;

-- The materialized view is intentionally not dropped: external jobs/dependencies
-- have not yet been inventoried. REFRESH remains owner-controlled (owner: postgres).
-- Before eventual DROP, inspect its ACL, dependent objects, and any refresh jobs.

-- ---------------------------------------------------------------------------
-- 3. Trigger-function hardening
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_user_id UUID;
    v_ip_address TEXT;
    v_record_id UUID;
    v_metadata JSONB;
BEGIN
    v_user_id := NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::UUID;
    v_ip_address := pg_catalog.current_setting('request.ip_address', true);

    IF TG_OP = 'DELETE' THEN
        v_record_id := OLD.id;
        v_metadata := pg_catalog.to_jsonb(OLD);
    ELSE
        v_record_id := NEW.id;
        v_metadata := pg_catalog.to_jsonb(NEW);
    END IF;

    INSERT INTO public.audit_logs (
        user_id,
        action_type,
        table_name,
        record_id,
        ip_address,
        metadata
    ) VALUES (
        v_user_id,
        TG_OP,
        TG_TABLE_NAME,
        v_record_id,
        v_ip_address,
        v_metadata
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

ALTER FUNCTION public.audit_trigger_fn() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.audit_trigger_fn() FROM PUBLIC, anon, authenticated;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs NO FORCE ROW LEVEL SECURITY;

-- Existing functions from migration 006. PostGIS functions are installed in
-- public, so pg_catalog is first and public is retained only where required.
ALTER FUNCTION public.set_updated_at() SET search_path = pg_catalog;
ALTER FUNCTION public.promote_administrative_boundary_import(UUID)
  SET search_path = pg_catalog, public;
ALTER FUNCTION public.get_boundaries_in_view(
    DOUBLE PRECISION,
    DOUBLE PRECISION,
    DOUBLE PRECISION,
    DOUBLE PRECISION,
    TEXT,
    DOUBLE PRECISION
) SET search_path = pg_catalog, public;

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.promote_administrative_boundary_import(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_boundaries_in_view(
    DOUBLE PRECISION,
    DOUBLE PRECISION,
    DOUBLE PRECISION,
    DOUBLE PRECISION,
    TEXT,
    DOUBLE PRECISION
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.promote_administrative_boundary_import(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_boundaries_in_view(
    DOUBLE PRECISION,
    DOUBLE PRECISION,
    DOUBLE PRECISION,
    DOUBLE PRECISION,
    TEXT,
    DOUBLE PRECISION
) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Replace permissive project policies with project-rooted RBAC
-- ---------------------------------------------------------------------------

-- Drop every existing policy on the authorization-root/child tables. This is
-- deliberate: policy names from the live system are not a reliable security
-- boundary, and permissive policies are OR-combined by PostgreSQL.
DO $policy_reset$
DECLARE
    target_table TEXT;
    existing_policy RECORD;
BEGIN
    FOREACH target_table IN ARRAY ARRAY[
        'spatial_projects',
        'vector_layers',
        'b2b_entitlements',
        'analysis_reports',
        'smce_criteria_weights',
        'flood_analysis_results'
    ]
    LOOP
        IF pg_catalog.to_regclass(pg_catalog.format('public.%I', target_table)) IS NOT NULL THEN
            EXECUTE pg_catalog.format(
                'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
                target_table
            );
            FOR existing_policy IN
                SELECT policy.polname
                FROM pg_catalog.pg_policy AS policy
                JOIN pg_catalog.pg_class AS relation ON relation.oid = policy.polrelid
                JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
                WHERE namespace.nspname = 'public'
                  AND relation.relname = target_table
            LOOP
                EXECUTE pg_catalog.format(
                    'DROP POLICY %I ON public.%I',
                    existing_policy.polname,
                    target_table
                );
            END LOOP;
        END IF;
    END LOOP;
END;
$policy_reset$;

-- The SECURITY DEFINER access helper depends on owner bypass, not recursive RLS.
ALTER TABLE public.spatial_projects NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_entitlements NO FORCE ROW LEVEL SECURITY;

CREATE POLICY p4i_projects_read
ON public.spatial_projects
FOR SELECT
TO anon, authenticated
USING (public.can_access_project(id));

CREATE POLICY p4i_projects_insert_by_analyst
ON public.spatial_projects
FOR INSERT
TO authenticated
WITH CHECK (
    public.get_current_user_role() IN (
        'managerial_analyst'::public.user_role,
        'super_admin'::public.user_role
    )
);

CREATE POLICY p4i_projects_update_by_analyst
ON public.spatial_projects
FOR UPDATE
TO authenticated
USING (
    public.get_current_user_role() IN (
        'managerial_analyst'::public.user_role,
        'super_admin'::public.user_role
    )
)
WITH CHECK (
    public.get_current_user_role() IN (
        'managerial_analyst'::public.user_role,
        'super_admin'::public.user_role
    )
);

CREATE POLICY p4i_projects_delete_by_super_admin
ON public.spatial_projects
FOR DELETE
TO authenticated
USING (public.get_current_user_role() = 'super_admin'::public.user_role);

CREATE POLICY p4i_vector_layers_read_by_project
ON public.vector_layers
FOR SELECT
TO anon, authenticated
USING (public.can_access_project(project_id));

CREATE POLICY p4i_vector_layers_insert_by_analyst
ON public.vector_layers
FOR INSERT
TO authenticated
WITH CHECK (
    public.get_current_user_role() IN (
        'managerial_analyst'::public.user_role,
        'super_admin'::public.user_role
    )
);

CREATE POLICY p4i_vector_layers_update_by_analyst
ON public.vector_layers
FOR UPDATE
TO authenticated
USING (
    public.get_current_user_role() IN (
        'managerial_analyst'::public.user_role,
        'super_admin'::public.user_role
    )
)
WITH CHECK (
    public.get_current_user_role() IN (
        'managerial_analyst'::public.user_role,
        'super_admin'::public.user_role
    )
);

CREATE POLICY p4i_vector_layers_delete_by_super_admin
ON public.vector_layers
FOR DELETE
TO authenticated
USING (public.get_current_user_role() = 'super_admin'::public.user_role);

CREATE POLICY p4i_entitlements_read_own_or_super_admin
ON public.b2b_entitlements
FOR SELECT
TO authenticated
USING (
    client_user_id = (SELECT auth.uid())
    OR public.get_current_user_role() = 'super_admin'::public.user_role
);

CREATE POLICY p4i_entitlements_write_by_super_admin
ON public.b2b_entitlements
FOR ALL
TO authenticated
USING (public.get_current_user_role() = 'super_admin'::public.user_role)
WITH CHECK (public.get_current_user_role() = 'super_admin'::public.user_role);

-- Optional live child tables are hardened only when both the table and its
-- project_id relationship exist. This prevents assumptions from breaking a
-- fresh schema while eliminating permissive USING (true) policies when present.
DO $optional_children$
DECLARE
    target_table TEXT;
BEGIN
    FOREACH target_table IN ARRAY ARRAY['analysis_reports', 'smce_criteria_weights']
    LOOP
        IF pg_catalog.to_regclass(pg_catalog.format('public.%I', target_table)) IS NOT NULL
           AND EXISTS (
               SELECT 1
               FROM information_schema.columns
               WHERE table_schema = 'public'
                 AND table_name = target_table
                 AND column_name = 'project_id'
            ) THEN
            EXECUTE pg_catalog.format(
                'CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (public.can_access_project(project_id))',
                'p4i_' || target_table || '_read_by_project',
                target_table
            );
            EXECUTE pg_catalog.format(
                'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.get_current_user_role() IN (''managerial_analyst''::public.user_role, ''super_admin''::public.user_role))',
                'p4i_' || target_table || '_insert_by_analyst',
                target_table
            );
            EXECUTE pg_catalog.format(
                'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.get_current_user_role() IN (''managerial_analyst''::public.user_role, ''super_admin''::public.user_role)) WITH CHECK (public.get_current_user_role() IN (''managerial_analyst''::public.user_role, ''super_admin''::public.user_role))',
                'p4i_' || target_table || '_update_by_analyst',
                target_table
            );
            EXECUTE pg_catalog.format(
                'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.get_current_user_role() = ''super_admin''::public.user_role)',
                'p4i_' || target_table || '_delete_by_super_admin',
                target_table
            );
            EXECUTE pg_catalog.format(
                'GRANT SELECT ON TABLE public.%I TO anon, authenticated',
                target_table
            );
            EXECUTE pg_catalog.format(
                'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM anon, authenticated',
                target_table
            );
        ELSE
            RAISE NOTICE 'Skipping %.project_id policies: table or column is absent', target_table;
        END IF;
    END LOOP;
END;
$optional_children$;

-- flood_analysis_results has no project_id in migration 006. It therefore
-- cannot inherit project authorization and is directly readable only by the
-- two analysis/admin roles. B2B clients receive scoped results through the API.
CREATE POLICY p4i_flood_results_read_by_analyst
ON public.flood_analysis_results
FOR SELECT
TO authenticated
USING (
    public.get_current_user_role() IN (
        'managerial_analyst'::public.user_role,
        'super_admin'::public.user_role
    )
);

-- Read grants pair with RLS. Browser mutations remain unavailable; permitted
-- analyst/admin mutations go through authenticated Next.js APIs and service_role.
GRANT SELECT ON TABLE public.spatial_projects TO anon, authenticated;
GRANT SELECT ON TABLE public.vector_layers TO anon, authenticated;
GRANT SELECT ON TABLE public.b2b_entitlements TO authenticated;
GRANT SELECT ON TABLE public.flood_analysis_results TO authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.spatial_projects,
           public.vector_layers,
           public.b2b_entitlements,
           public.audit_logs,
           public.download_history,
           public.sales_leads,
           public.administrative_boundaries,
           public.administrative_boundaries_import_staging,
           public.flood_analysis_results
  FROM anon, authenticated;

-- Audit reads are available only through the super_admin API route.
REVOKE SELECT ON TABLE public.audit_logs FROM anon, authenticated;

GRANT ALL PRIVILEGES ON TABLE public.spatial_projects,
                               public.vector_layers,
                               public.b2b_entitlements,
                               public.audit_logs,
                               public.download_history,
                               public.sales_leads,
                               public.administrative_boundaries,
                               public.administrative_boundaries_import_staging,
                               public.flood_analysis_results
  TO service_role;

COMMIT;
