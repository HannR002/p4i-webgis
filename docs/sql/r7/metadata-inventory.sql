-- READ ONLY. Run only against explicitly approved adrbrvnoejqxemrdwuwr.
-- Metadata only: no application/auth/storage object row contents, tokens, function bodies or secrets.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '15s';
SELECT current_database() AS database_name, current_setting('server_version') AS postgres_version;
SELECT extname, extversion FROM pg_extension ORDER BY extname;
SELECT nspname AS schema_name FROM pg_namespace
 WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' ORDER BY 1;
SELECT n.nspname AS schema_name, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity,
 pg_get_userbyid(c.relowner) AS owner, c.relacl::text AS explicit_acl,
 CASE WHEN c.relkind IN ('v','m') THEN c.reloptions ELSE NULL END AS view_options
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
 AND c.relkind IN ('r','p','v','m','f') ORDER BY 1,2;
SELECT table_schema,table_name,column_name,data_type,is_nullable
 FROM information_schema.columns WHERE table_schema IN ('public','auth','storage') ORDER BY 1,2,ordinal_position;
SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
 FROM pg_policies ORDER BY 1,2,3;
SELECT table_schema,table_name,grantee,privilege_type,is_grantable
 FROM information_schema.table_privileges ORDER BY 1,2,3,4;
SELECT n.nspname AS schema_name,p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,
 p.prosecdef AS security_definer,pg_get_userbyid(p.proowner) AS owner,p.proacl::text AS explicit_acl,
 (SELECT string_agg(v,',') FROM unnest(p.proconfig) AS v WHERE v LIKE 'search_path=%') AS search_path,
 md5(p.prosrc) AS source_fingerprint,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema' ORDER BY 1,2,3;
SELECT n.nspname AS schema_name,c.relname,t.tgname,t.tgenabled,p.proname AS function_name
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_proc p ON p.oid=t.tgfoid WHERE NOT t.tgisinternal ORDER BY 1,2,3;
SELECT n.nspname AS schema_name,c.relname,con.conname,con.contype,pg_get_constraintdef(con.oid) AS definition
 FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('public','auth','storage') ORDER BY 1,2,3;
SELECT schemaname,tablename,indexname,indexdef FROM pg_indexes WHERE schemaname IN ('public','storage') ORDER BY 1,2,3;
-- Supabase advisors and migration history need separately authorized management metadata tools.
-- Auth profile trust checks above inspect columns/triggers/policies, never profile or auth.users rows.
ROLLBACK;
