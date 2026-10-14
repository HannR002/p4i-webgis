-- Synthetic identities and geometries, not real users/locations/measurements.
INSERT INTO auth.users (id, raw_user_meta_data) VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '{"full_name":"DEMO Client A","role":"super_admin"}'),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '{"full_name":"DEMO Client B"}'),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', '{"full_name":"DEMO Analyst"}'),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', '{"full_name":"DEMO Admin"}'),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5', '{"full_name":"DEMO Disabled"}');
UPDATE public.user_profiles SET role = 'managerial_analyst' WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
UPDATE public.user_profiles SET role = 'super_admin' WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4';
UPDATE public.user_profiles SET is_disabled = true WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5';
INSERT INTO public.spatial_projects (id,title,access_tier) VALUES
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','DEMO Public','public'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','DEMO Restricted A','restricted'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3','DEMO Restricted B','restricted');
INSERT INTO public.vector_layers (project_id,layer_name,geom)
SELECT id, title, ST_SetSRID(ST_MakePoint(0,0),4326) FROM public.spatial_projects;
INSERT INTO public.b2b_entitlements (client_user_id, project_id) VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3'),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2');
INSERT INTO public.analysis_reports SELECT id,id,'DEMO PRIVATE DRAFT' FROM public.spatial_projects;
INSERT INTO public.smce_criteria_weights SELECT id,id,'{}'::jsonb FROM public.spatial_projects;
INSERT INTO public.download_history (client_user_id,project_id,file_type)
SELECT client_user_id,project_id,'pdf_report' FROM public.b2b_entitlements;
INSERT INTO public.administrative_boundaries (id,kode_wilayah,level,nama,source,source_version,geometry) VALUES
('cccccccc-cccc-4ccc-8ccc-ccccccccccc1','DEMO','provinsi','SYNTHETIC TEST','DEMO','fixture-v1',ST_Multi(ST_GeomFromText('POLYGON((0 0,1 0,1 1,0 1,0 0))',4326)));
INSERT INTO public.flood_analysis_results (cache_key,kecamatan_id,model_version,dataset_version,period_start,period_end,criteria_weights,criteria_breakdown,score,classification,expires_at)
VALUES ('SYNTHETIC-ONLY','cccccccc-cccc-4ccc-8ccc-ccccccccccc1','DEMO','DEMO','2026-01-01','2026-01-02','{}','{}',0,'very_low',now()+interval '1 day');
REFRESH MATERIALIZED VIEW public.vw_vector_layers_geojson;
