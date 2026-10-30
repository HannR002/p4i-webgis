-- NOT EXECUTED. Optional temporary containment, NOT a tenant authorization migration.
-- Requires a reviewed metadata snapshot, explicit impact approval and a backup of policy definitions.
-- Impact: denies all RLS-bound reads from the three tables while no alternative policy exists.
-- Public maps/reports AND ordinary analyst/client views may stop working. Service-role bypass is unaffected.
-- Never run this merely to repair an API error. No data/schema/ownership is deleted or recreated.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
DO $$
DECLARE item record; actual record;
BEGIN
 IF current_setting('p4i.r7.containment_approved',true) IS DISTINCT FROM 'adrbrvnoejqxemrdwuwr-metadata-reviewed' THEN
   RAISE EXCEPTION 'Explicit target/impact approval missing';
 END IF;
 FOR item IN SELECT * FROM (VALUES
   ('spatial_projects','Izinkan Publik Membaca Proyek'),
   ('vector_layers','Izinkan Publik Membaca Peta'),
   ('analysis_reports','Izinkan Publik Membaca Laporan')
 ) AS expected(table_name,policy_name) LOOP
   SELECT c.relrowsecurity INTO actual FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=item.table_name AND c.relkind='r';
   IF NOT FOUND OR actual.relrowsecurity IS DISTINCT FROM true THEN RAISE EXCEPTION 'Table/RLS drift'; END IF;
   SELECT * INTO actual FROM pg_policies WHERE schemaname='public' AND tablename=item.table_name AND policyname=item.policy_name;
   IF NOT FOUND OR actual.cmd <> 'SELECT' OR actual.permissive <> 'PERMISSIVE'
      OR actual.roles::text <> '{public}' OR coalesce(actual.qual,'') NOT IN ('true','(true)') THEN
     RAISE EXCEPTION 'Policy signature differs; inspect metadata before proposing corrections';
   END IF;
   IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=item.table_name
     AND cmd IN ('SELECT','ALL') AND policyname<>item.policy_name) THEN RAISE EXCEPTION 'Additional read policies require review'; END IF;
   EXECUTE format('ALTER POLICY %I ON public.%I USING (false)',item.policy_name,item.table_name);
 END LOOP;
END $$;
-- Deliberately ROLLBACK: operator must separately approve an apply migration after verification.
ROLLBACK;
