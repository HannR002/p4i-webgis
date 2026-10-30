BEGIN READ ONLY;
SELECT schemaname,tablename,policyname,roles,cmd,qual FROM pg_policies
 WHERE schemaname='public' AND tablename IN ('spatial_projects','vector_layers','analysis_reports') ORDER BY tablename,policyname;
SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,
 has_table_privilege('anon',c.oid,'SELECT') AS anon_grant,
 has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated_grant
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('spatial_projects','vector_layers','analysis_reports');
-- Retained SELECT grants do not defeat enabled RLS; verify there is no other permissive read policy.
-- Later direct PostgREST A/B/analyst/admin tests need approved synthetic staging identities/data.
-- Do not query confidential existing rows as a test.
ROLLBACK;
