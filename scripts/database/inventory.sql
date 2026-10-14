-- Metadata-only evidence capture. Does not read application/auth rows or secrets.
-- Function definitions are deliberately excluded: inspect a restricted schema-only
-- pg_dump separately for embedded literals before committing any captured DDL.
BEGIN TRANSACTION READ ONLY;
SELECT current_database() AS database_name, version() AS engine;
SELECT e.extname,e.extversion,n.nspname AS extension_schema
FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
WHERE e.extname IN ('postgis','pgcrypto');
SELECT n.nspname,t.typname,e.enumlabel,e.enumsortorder
FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid
WHERE n.nspname='public' ORDER BY t.typname,e.enumsortorder;
SELECT c.relname,c.relkind,pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity,c.relforcerowsecurity,c.relacl
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S') ORDER BY c.relname;
SELECT c.table_name,c.column_name,c.ordinal_position,c.data_type,c.udt_schema,c.udt_name,
       c.is_nullable,c.column_default,c.is_identity,c.is_generated
FROM information_schema.columns c
WHERE c.table_schema='public' ORDER BY c.table_name,c.ordinal_position;
SELECT c.conrelid::regclass AS relation,c.conname,c.contype,pg_get_constraintdef(c.oid,true) AS definition
FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
WHERE n.nspname='public' ORDER BY c.conrelid::regclass::text,c.conname;
SELECT schemaname,tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public';
SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public';
SELECT p.proname,pg_get_function_identity_arguments(p.oid),pg_get_function_result(p.oid),
       pg_get_userbyid(p.proowner),p.prosecdef,p.proconfig,p.proacl
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND NOT EXISTS (
  SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e'
);
SELECT t.tgrelid::regclass AS relation,t.tgname,pg_get_triggerdef(t.oid,true)
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE NOT t.tgisinternal AND (n.nspname='public' OR (n.nspname='auth' AND c.relname='users'));
SELECT pg_get_userbyid(defaclrole) AS owner,defaclnamespace::regnamespace,defaclobjtype,defaclacl FROM pg_default_acl;
SELECT grantee,table_name,privilege_type FROM information_schema.table_privileges WHERE table_schema='public';
SELECT pg_describe_object(d.classid,d.objid,d.objsubid) AS dependent,
       pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid) AS dependency,d.deptype
FROM pg_depend d WHERE d.refobjid IN (to_regclass('public.vw_vector_layers_geojson'),to_regclass('public.vw_spatial_projects'));
COMMIT;
