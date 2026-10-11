-- P4I staging metadata verification (read-only).
-- Run only after migrations have been applied manually to a disposable staging project.

SELECT
    pg_catalog.current_database() AS database_name,
    pg_catalog.current_setting('server_version') AS postgres_version;

SELECT extension.extname, extension.extversion
FROM pg_catalog.pg_extension AS extension
WHERE extension.extname IN ('postgis', 'pgcrypto')
ORDER BY extension.extname;

SELECT
    namespace.nspname AS schema_name,
    type.typname AS type_name,
    enum.enumlabel AS enum_label,
    enum.enumsortorder AS sort_order
FROM pg_catalog.pg_type AS type
JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = type.typnamespace
JOIN pg_catalog.pg_enum AS enum ON enum.enumtypid = type.oid
WHERE namespace.nspname = 'public'
  AND type.typname = 'user_role'
ORDER BY enum.enumsortorder;

SELECT
    namespace.nspname AS schema_name,
    relation.relname AS object_name,
    CASE relation.relkind
        WHEN 'r' THEN 'table'
        WHEN 'p' THEN 'partitioned_table'
        WHEN 'v' THEN 'view'
        WHEN 'm' THEN 'materialized_view'
        WHEN 'S' THEN 'sequence'
        ELSE relation.relkind::TEXT
    END AS object_type,
    pg_catalog.pg_get_userbyid(relation.relowner) AS owner_name,
    relation.relrowsecurity AS rls_enabled,
    relation.relforcerowsecurity AS force_rls,
    relation.relacl AS access_control_list
FROM pg_catalog.pg_class AS relation
JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
WHERE namespace.nspname = 'public'
  AND relation.relname IN (
      'user_profiles',
      'spatial_projects',
      'vector_layers',
      'b2b_entitlements',
      'audit_logs',
      'sales_leads',
      'download_history',
      'administrative_boundaries',
      'administrative_boundaries_import_staging',
      'flood_analysis_results',
      'analysis_reports',
      'smce_criteria_weights',
      'vw_vector_layers_geojson',
      'vw_spatial_projects'
  )
ORDER BY relation.relname;

SELECT
    namespace.nspname AS schema_name,
    procedure.proname AS function_name,
    pg_catalog.pg_get_function_identity_arguments(procedure.oid) AS identity_arguments,
    pg_catalog.pg_get_userbyid(procedure.proowner) AS owner_name,
    procedure.prosecdef AS security_definer,
    procedure.provolatile AS volatility_code,
    procedure.proconfig AS function_settings,
    procedure.proacl AS access_control_list
FROM pg_catalog.pg_proc AS procedure
JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
WHERE namespace.nspname = 'public'
  AND procedure.proname IN (
      'handle_new_user',
      'get_current_user_role',
      'can_access_project',
      'audit_trigger_fn',
      'set_updated_at',
      'promote_administrative_boundary_import',
      'get_boundaries_in_view',
      'get_project_vector_layers_geojson'
  )
ORDER BY procedure.proname, identity_arguments;

SELECT
    policy.schemaname,
    policy.tablename,
    policy.policyname,
    policy.permissive,
    policy.roles,
    policy.cmd,
    policy.qual,
    policy.with_check
FROM pg_catalog.pg_policies AS policy
WHERE policy.schemaname = 'public'
  AND policy.tablename IN (
      'user_profiles',
      'spatial_projects',
      'vector_layers',
      'b2b_entitlements',
      'audit_logs',
      'download_history',
      'administrative_boundaries',
      'administrative_boundaries_import_staging',
      'flood_analysis_results',
      'analysis_reports',
      'smce_criteria_weights'
  )
ORDER BY policy.tablename, policy.policyname;

SELECT
    grant_info.table_schema,
    grant_info.table_name,
    grant_info.grantee,
    grant_info.privilege_type,
    grant_info.is_grantable
FROM information_schema.role_table_grants AS grant_info
WHERE grant_info.table_schema = 'public'
  AND grant_info.grantee IN ('anon', 'authenticated', 'service_role')
  AND grant_info.table_name IN (
      'user_profiles',
      'spatial_projects',
      'vector_layers',
      'b2b_entitlements',
      'audit_logs',
      'download_history',
      'administrative_boundaries',
      'administrative_boundaries_import_staging',
      'flood_analysis_results',
      'analysis_reports',
      'smce_criteria_weights',
      'vw_vector_layers_geojson'
  )
ORDER BY grant_info.table_name, grant_info.grantee, grant_info.privilege_type;

SELECT
    role.rolname AS browser_role,
    relation.relname AS materialized_view,
    CASE
        WHEN relation.oid IS NULL THEN NULL
        ELSE pg_catalog.has_table_privilege(role.oid, relation.oid, 'SELECT')
    END AS can_select
FROM pg_catalog.pg_roles AS role
LEFT JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.nspname = 'public'
LEFT JOIN pg_catalog.pg_class AS relation
    ON relation.relnamespace = namespace.oid
   AND relation.relname = 'vw_vector_layers_geojson'
   AND relation.relkind = 'm'
WHERE role.rolname IN ('anon', 'authenticated')
ORDER BY role.rolname;

SELECT
    namespace.nspname AS schema_name,
    relation.relname AS table_name,
    trigger.tgname AS trigger_name,
    pg_catalog.pg_get_triggerdef(trigger.oid, TRUE) AS trigger_definition
FROM pg_catalog.pg_trigger AS trigger
JOIN pg_catalog.pg_class AS relation ON relation.oid = trigger.tgrelid
JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
WHERE trigger.tgisinternal = FALSE
  AND (
      namespace.nspname = 'public'
      OR (namespace.nspname = 'auth' AND relation.relname = 'users')
  )
ORDER BY namespace.nspname, relation.relname, trigger.tgname;

SELECT
    source_namespace.nspname AS schema_name,
    source_table.relname AS table_name,
    constraint_info.conname AS constraint_name,
    target_namespace.nspname AS referenced_schema,
    target_table.relname AS referenced_table,
    pg_catalog.pg_get_constraintdef(constraint_info.oid, TRUE) AS constraint_definition
FROM pg_catalog.pg_constraint AS constraint_info
JOIN pg_catalog.pg_class AS source_table ON source_table.oid = constraint_info.conrelid
JOIN pg_catalog.pg_namespace AS source_namespace ON source_namespace.oid = source_table.relnamespace
JOIN pg_catalog.pg_class AS target_table ON target_table.oid = constraint_info.confrelid
JOIN pg_catalog.pg_namespace AS target_namespace ON target_namespace.oid = target_table.relnamespace
WHERE constraint_info.contype = 'f'
  AND source_namespace.nspname = 'public'
ORDER BY source_table.relname, constraint_info.conname;
