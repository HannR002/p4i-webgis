-- PROPOSAL, NOT AN APPROVED EXTERNAL MIGRATION. Missing verified foundation DDL.
-- Executable only in the disposable Phase 15 local fixture. Never in migration-plan.mjs.
BEGIN;
DO $$ BEGIN
  IF current_database() <> 'p4i_phase15_local' OR current_setting('p4i.local_fixture', true) IS DISTINCT FROM 'synthetic-only' THEN
    RAISE EXCEPTION 'BLOCKED: verified foundation and external authorization unavailable';
  END IF;
END $$;
CREATE SCHEMA p4i_vector;
REVOKE ALL ON SCHEMA p4i_vector FROM PUBLIC, anon, authenticated, service_role;
CREATE TABLE p4i_vector.project_editors (
  project_id uuid NOT NULL REFERENCES public.spatial_projects(id),
  user_id uuid NOT NULL REFERENCES public.user_profiles(id),
  permission text NOT NULL CHECK (permission IN ('owner','editor')),
  PRIMARY KEY(project_id,user_id)
);
CREATE TABLE p4i_vector.layers (
  id uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.spatial_projects(id),
  revision integer NOT NULL CHECK (revision > 0),
  metadata jsonb NOT NULL, archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES public.user_profiles(id), updated_by uuid NOT NULL REFERENCES public.user_profiles(id)
);
CREATE INDEX vector_layers_project_idx ON p4i_vector.layers(project_id, archived);
CREATE TABLE p4i_vector.features (
  id uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),
  layer_id uuid NOT NULL REFERENCES p4i_vector.layers(id), local_id text NOT NULL,
  revision integer NOT NULL CHECK(revision > 0),
  geom public.geometry(Geometry,4326) NOT NULL,
  properties jsonb NOT NULL, ordinal integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES public.user_profiles(id), updated_by uuid NOT NULL REFERENCES public.user_profiles(id),
  UNIQUE(layer_id,local_id),
  CHECK (public.ST_SRID(geom)=4326 AND public.ST_NDims(geom)=2 AND NOT public.ST_IsEmpty(geom) AND public.ST_NPoints(geom)<=512 AND public.ST_IsValid(geom))
);
CREATE INDEX vector_features_geom_gist ON p4i_vector.features USING gist(geom);
CREATE TABLE p4i_vector.layer_revisions (
  layer_id uuid NOT NULL REFERENCES p4i_vector.layers(id), revision integer NOT NULL,
  actor_id uuid NOT NULL REFERENCES public.user_profiles(id), created_at timestamptz NOT NULL DEFAULT now(),
  snapshot jsonb NOT NULL, PRIMARY KEY(layer_id,revision)
);
CREATE TABLE p4i_vector.feature_revisions (
  feature_id uuid NOT NULL, layer_id uuid NOT NULL REFERENCES p4i_vector.layers(id), revision integer NOT NULL,
  actor_id uuid NOT NULL REFERENCES public.user_profiles(id), created_at timestamptz NOT NULL DEFAULT now(),
  deleted boolean NOT NULL, geometry jsonb NOT NULL, properties jsonb NOT NULL,
  PRIMARY KEY(feature_id,revision)
);
CREATE TABLE p4i_vector.requests (
  actor_id uuid NOT NULL REFERENCES public.user_profiles(id), request_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.spatial_projects(id), fingerprint bytea NOT NULL, result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(actor_id,request_id)
);
ALTER TABLE p4i_vector.project_editors ENABLE ROW LEVEL SECURITY;
ALTER TABLE p4i_vector.layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE p4i_vector.features ENABLE ROW LEVEL SECURITY;
ALTER TABLE p4i_vector.layer_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE p4i_vector.feature_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE p4i_vector.requests ENABLE ROW LEVEL SECURITY;
-- RPC-only access; no direct table privileges or browser mutation policy. Definer checks below are mandatory.
REVOKE ALL ON ALL TABLES IN SCHEMA p4i_vector FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION p4i_vector.authorize(p_project uuid, p_write boolean) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,p4i_vector AS $$
DECLARE actor uuid := auth.uid(); actor_role text; disabled boolean; tier text; assigned boolean;
BEGIN
  IF actor IS NOT NULL THEN
    SELECT role::text, is_disabled INTO actor_role, disabled FROM public.user_profiles WHERE id=actor;
    IF actor_role IS NULL OR disabled IS DISTINCT FROM false THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
  END IF;
  SELECT access_tier INTO tier FROM public.spatial_projects WHERE id=p_project;
  IF tier IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
  SELECT EXISTS(SELECT 1 FROM p4i_vector.project_editors WHERE project_id=p_project AND user_id=actor) INTO assigned;
  IF p_write THEN
    IF actor_role='super_admin' OR (actor_role='managerial_analyst' AND assigned) THEN RETURN true; END IF;
  ELSE
    IF tier='public' OR actor_role='super_admin' OR (actor_role='managerial_analyst' AND assigned) OR (actor_role='b2b_client' AND EXISTS(SELECT 1 FROM public.b2b_entitlements WHERE project_id=p_project AND client_user_id=actor)) THEN RETURN true; END IF;
  END IF;
  RAISE EXCEPTION 'Access denied' USING ERRCODE='42501';
END $$;
CREATE FUNCTION p4i_vector.can_edit(p_project uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,p4i_vector AS $$
BEGIN PERFORM p4i_vector.authorize(p_project,true); RETURN true;
EXCEPTION WHEN insufficient_privilege THEN RETURN false; END $$;
CREATE FUNCTION p4i_vector.coordinates(v jsonb, depth integer DEFAULT 0) RETURNS integer
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE child jsonb; n integer:=0;
BEGIN
  IF jsonb_typeof(v)<>'array' OR depth>4 OR jsonb_array_length(v)<1 OR jsonb_array_length(v)>129 THEN RAISE EXCEPTION 'Invalid coordinates' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(v->0)='number' THEN
    IF jsonb_array_length(v)<>2 OR jsonb_typeof(v->1)<>'number' OR (v->>0)::numeric NOT BETWEEN -180 AND 180 OR (v->>1)::numeric NOT BETWEEN -90 AND 90 THEN RAISE EXCEPTION 'Invalid position' USING ERRCODE='22023'; END IF;
    RETURN 1;
  END IF;
  FOR child IN SELECT value FROM jsonb_array_elements(v) LOOP n:=n+p4i_vector.coordinates(child,depth+1); END LOOP;
  IF n>512 THEN RAISE EXCEPTION 'Geometry limit' USING ERRCODE='22023'; END IF;
  RETURN n;
END $$;
CREATE FUNCTION p4i_vector.style(v jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
BEGIN
  IF jsonb_typeof(v)<>'object' OR NOT v ?& ARRAY['color','fillColor','weight','fillOpacity','radius'] OR EXISTS(SELECT 1 FROM jsonb_object_keys(v) k WHERE k NOT IN ('color','fillColor','weight','fillOpacity','radius','strokeOpacity','dash'))
    OR jsonb_typeof(v->'color')<>'string' OR jsonb_typeof(v->'fillColor')<>'string' OR (v->>'color') !~ '^#[a-fA-F0-9]{6}$' OR (v->>'fillColor') !~ '^#[a-fA-F0-9]{6}$'
    OR jsonb_typeof(v->'weight')<>'number' OR (v->>'weight')::numeric NOT BETWEEN 0 AND 10
    OR jsonb_typeof(v->'fillOpacity')<>'number' OR (v->>'fillOpacity')::numeric NOT BETWEEN 0 AND 1
    OR jsonb_typeof(v->'radius')<>'number' OR (v->>'radius')::numeric NOT BETWEEN 2 AND 20
    OR (v ? 'strokeOpacity' AND (jsonb_typeof(v->'strokeOpacity')<>'number' OR (v->>'strokeOpacity')::numeric NOT BETWEEN 0 AND 1))
    OR (v ? 'dash' AND (jsonb_typeof(v->'dash')<>'string' OR v->>'dash' NOT IN ('solid','dash','dot'))) THEN RAISE EXCEPTION 'Invalid style' USING ERRCODE='22023'; END IF;
  RETURN true;
END $$;
CREATE FUNCTION p4i_vector.validate_layer(doc jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public,p4i_vector AS $$
DECLARE f jsonb; props jsonb; attr record; g public.geometry;
BEGIN
  IF jsonb_typeof(doc)<>'object' OR octet_length(doc::text)>65536 OR NOT doc ?& ARRAY['id','name','visible','opacity','style','data']
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(doc) k WHERE k NOT IN ('id','name','visible','opacity','style','data'))
    OR jsonb_typeof(doc->'id')<>'string' OR jsonb_typeof(doc->'name')<>'string' OR doc->>'id' !~ '^local-vector-[0-9]+$' OR length(doc->>'name') NOT BETWEEN 1 AND 80 OR length(btrim(doc->>'name'))=0
    OR jsonb_typeof(doc->'visible')<>'boolean' OR jsonb_typeof(doc->'opacity')<>'number' OR (doc->>'opacity')::numeric NOT BETWEEN 0 AND 1
    OR jsonb_typeof(doc->'data')<>'object' OR NOT (doc->'data') ?& ARRAY['type','features'] OR EXISTS(SELECT 1 FROM jsonb_object_keys(doc->'data') k WHERE k NOT IN ('type','features')) OR jsonb_typeof(doc->'data'->'type')<>'string' OR doc->'data'->>'type'<>'FeatureCollection' OR jsonb_typeof(doc->'data'->'features')<>'array'
    OR jsonb_array_length(doc->'data'->'features')>100 THEN RAISE EXCEPTION 'Invalid layer' USING ERRCODE='22023'; END IF;
  PERFORM p4i_vector.style(doc->'style');
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(doc->'data'->'features') AS entries(value) GROUP BY entries.value->>'id' HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate local identity' USING ERRCODE='22023'; END IF;
  FOR f IN SELECT value FROM jsonb_array_elements(doc->'data'->'features') LOOP
    IF jsonb_typeof(f->'type')<>'string' OR f->>'type'<>'Feature' OR f->>'id' !~ '^local-feature-[0-9]+$' OR NOT f ?& ARRAY['id','type','geometry','properties'] OR EXISTS(SELECT 1 FROM jsonb_object_keys(f) k WHERE k NOT IN ('type','id','geometry','properties')) THEN RAISE EXCEPTION 'Invalid feature' USING ERRCODE='22023'; END IF;
    props:=f->'properties';
    IF jsonb_typeof(props)<>'object' OR NOT props ?& ARRAY['name','description','attributes'] OR jsonb_typeof(props->'name')<>'string' OR length(props->>'name') NOT BETWEEN 1 AND 80 OR length(btrim(props->>'name'))=0 OR jsonb_typeof(props->'description')<>'string' OR length(props->>'description')>500
      OR jsonb_typeof(props->'attributes')<>'object' OR (SELECT count(*) FROM jsonb_object_keys(props->'attributes'))>12
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(props) k WHERE k NOT IN ('name','description','attributes','style')) THEN RAISE EXCEPTION 'Invalid properties' USING ERRCODE='22023'; END IF;
    FOR attr IN SELECT key,value FROM jsonb_each(props->'attributes') LOOP
      IF attr.key !~ '^[a-zA-Z][a-zA-Z0-9_]{0,31}$' OR attr.key IN ('constructor','prototype','__proto__') OR jsonb_typeof(attr.value) NOT IN ('string','number','boolean') OR (jsonb_typeof(attr.value)='string' AND length(attr.value#>>'{}')>200) OR (jsonb_typeof(attr.value)='number' AND abs((attr.value#>>'{}')::numeric)>1e12) THEN RAISE EXCEPTION 'Invalid attribute' USING ERRCODE='22023'; END IF;
    END LOOP;
    IF props ? 'style' THEN PERFORM p4i_vector.style(props->'style'); END IF;
    IF jsonb_typeof(f->'geometry'->'type')<>'string' OR NOT f->'geometry' ?& ARRAY['type','coordinates'] OR EXISTS(SELECT 1 FROM jsonb_object_keys(f->'geometry') k WHERE k NOT IN ('type','coordinates')) OR f->'geometry'->>'type' NOT IN ('Point','LineString','Polygon','MultiLineString','MultiPolygon') THEN RAISE EXCEPTION 'Invalid geometry type' USING ERRCODE='22023'; END IF;
    IF f->'geometry'->>'type' IN ('MultiLineString','MultiPolygon','Polygon') AND jsonb_array_length(f->'geometry'->'coordinates')>8 THEN RAISE EXCEPTION 'Part limit' USING ERRCODE='22023'; END IF;
    IF f->'geometry'->>'type'='MultiPolygon' AND EXISTS(SELECT 1 FROM jsonb_array_elements(f->'geometry'->'coordinates') p WHERE jsonb_array_length(p)>8) THEN RAISE EXCEPTION 'Ring limit' USING ERRCODE='22023'; END IF;
    IF f->'geometry'->>'type'='LineString' AND jsonb_array_length(f->'geometry'->'coordinates')>128 THEN RAISE EXCEPTION 'Vertex limit' USING ERRCODE='22023'; END IF;
    IF f->'geometry'->>'type'='MultiLineString' AND EXISTS(SELECT 1 FROM jsonb_array_elements(f->'geometry'->'coordinates') p WHERE jsonb_array_length(p)>128) THEN RAISE EXCEPTION 'Vertex limit' USING ERRCODE='22023'; END IF;
    PERFORM p4i_vector.coordinates(f->'geometry'->'coordinates');
    g:=public.ST_GeomFromGeoJSON((f->'geometry')::text);
    IF public.ST_SRID(g)<>4326 OR public.ST_NDims(g)<>2 OR public.ST_IsEmpty(g) OR public.ST_NPoints(g)>512 OR NOT public.ST_IsValid(g) THEN RAISE EXCEPTION 'Invalid geometry' USING ERRCODE='22023'; END IF;
  END LOOP;
  RETURN true;
END $$;
CREATE FUNCTION p4i_vector.document(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,p4i_vector AS $$
  SELECT jsonb_build_object('id',l.id,'projectId',l.project_id,'revision',l.revision,'canEdit',p4i_vector.can_edit(l.project_id),'archived',l.archived,'createdAt',l.created_at,'updatedAt',l.updated_at,'updatedBy',l.updated_by,
    'layer',l.metadata || jsonb_build_object('data',jsonb_build_object('type','FeatureCollection','features',coalesce((SELECT jsonb_agg(jsonb_build_object('type','Feature','id',f.local_id,'geometry',public.ST_AsGeoJSON(f.geom,15)::jsonb,'properties',f.properties) ORDER BY f.ordinal) FROM p4i_vector.features f WHERE f.layer_id=l.id),'[]'::jsonb))),
    'features',coalesce((SELECT jsonb_agg(jsonb_build_object('id',f.id,'localId',f.local_id,'revision',f.revision) ORDER BY f.ordinal) FROM p4i_vector.features f WHERE f.layer_id=l.id),'[]'::jsonb)) FROM p4i_vector.layers l WHERE l.id=p_id
$$;
CREATE FUNCTION p4i_vector.immutable_revision() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Revision evidence is immutable' USING ERRCODE='42501'; END $$;
CREATE TRIGGER immutable_layer_revision BEFORE UPDATE OR DELETE ON p4i_vector.layer_revisions FOR EACH ROW EXECUTE FUNCTION p4i_vector.immutable_revision();
CREATE TRIGGER immutable_feature_revision BEFORE UPDATE OR DELETE ON p4i_vector.feature_revisions FOR EACH ROW EXECUTE FUNCTION p4i_vector.immutable_revision();

CREATE FUNCTION public.p4i_vector_store(operation text, input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,p4i_vector AS $$
DECLARE actor uuid:=auth.uid(); project uuid; lid uuid; req uuid; doc jsonb; item jsonb; snapshot jsonb; existing p4i_vector.layers; previous p4i_vector.features; existing_request p4i_vector.requests; ids text[]:='{}'; i integer:=0; g public.geometry; result jsonb;
BEGIN
  PERFORM set_config('statement_timeout','4000',true);
  IF operation IS NULL OR operation NOT IN ('projects','layers','load','save','revisions') THEN RAISE EXCEPTION 'Invalid operation' USING ERRCODE='22023'; END IF;
  IF input IS NULL OR jsonb_typeof(input)<>'object' OR octet_length(input::text)>131072 THEN RAISE EXCEPTION 'Invalid input' USING ERRCODE='22023'; END IF;
  -- Disabled identities are denied even on public projects.
  IF actor IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.user_profiles WHERE id=actor AND is_disabled=false) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
  IF operation='projects' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'accessTier',access_tier,'canEdit',p4i_vector.can_edit(id)) ORDER BY title),'[]'::jsonb) INTO result FROM (
      SELECT p.* FROM public.spatial_projects p WHERE p.access_tier='public' OR EXISTS(SELECT 1 FROM public.user_profiles WHERE id=actor AND role='super_admin') OR (EXISTS(SELECT 1 FROM public.user_profiles WHERE id=actor AND role='managerial_analyst') AND EXISTS(SELECT 1 FROM p4i_vector.project_editors WHERE project_id=p.id AND user_id=actor)) OR (EXISTS(SELECT 1 FROM public.user_profiles WHERE id=actor AND role='b2b_client') AND EXISTS(SELECT 1 FROM public.b2b_entitlements WHERE project_id=p.id AND client_user_id=actor)) ORDER BY p.id LIMIT 100
    ) visible;
    RETURN result;
  END IF;
  project:=(input->>'projectId')::uuid;
  PERFORM p4i_vector.authorize(project,operation='save');
  IF operation='layers' THEN
    RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',l.id,'name',l.metadata->>'name','revision',l.revision,'featureCount',(SELECT count(*) FROM p4i_vector.features WHERE layer_id=l.id)) ORDER BY l.created_at) FROM p4i_vector.layers l WHERE l.project_id=project AND NOT l.archived),'[]'::jsonb);
  END IF;
  lid:=(input->>'layerId')::uuid;
  IF operation IN ('load','revisions') THEN
    IF NOT EXISTS(SELECT 1 FROM p4i_vector.layers WHERE id=lid AND project_id=project AND NOT archived) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
    IF operation='load' THEN RETURN p4i_vector.document(lid); END IF;
    RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('revision',revision,'actorId',actor_id,'createdAt',created_at)) FROM (SELECT * FROM p4i_vector.layer_revisions WHERE layer_id=lid ORDER BY revision DESC LIMIT 30) r),'[]'::jsonb);
  END IF;
  IF operation<>'save' OR actor IS NULL OR NOT input ?& ARRAY['projectId','layerId','expectedRevision','requestId','layer','archive'] OR EXISTS(SELECT 1 FROM jsonb_object_keys(input) k WHERE k NOT IN ('projectId','layerId','expectedRevision','requestId','layer','archive')) THEN RAISE EXCEPTION 'Invalid operation' USING ERRCODE='22023'; END IF;
  req:=(input->>'requestId')::uuid;
  IF req IS NULL OR jsonb_typeof(input->'archive')<>'boolean' OR jsonb_typeof(input->'expectedRevision')<>'number' OR (input->>'expectedRevision') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Invalid revision' USING ERRCODE='22023'; END IF;
  -- Project lock bounds cross-layer totals and serializes writes. All dependent changes share this transaction.
  PERFORM 1 FROM public.spatial_projects WHERE id=project FOR UPDATE;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||req::text,0));
  SELECT * INTO existing_request FROM p4i_vector.requests WHERE actor_id=actor AND request_id=req;
  IF FOUND THEN
    IF existing_request.project_id<>project OR existing_request.fingerprint<>public.digest(input::text,'sha256') THEN RAISE EXCEPTION 'Idempotency conflict' USING ERRCODE='PT409'; END IF;
    RETURN existing_request.result;
  END IF;
  doc:=input->'layer'; PERFORM p4i_vector.validate_layer(doc);
  IF lid IS NULL THEN
    IF (input->>'expectedRevision')::integer<>0 OR (input->>'archive')::boolean OR (SELECT count(*) FROM p4i_vector.layers WHERE project_id=project AND NOT archived)>=8 THEN RAISE EXCEPTION 'Invalid creation' USING ERRCODE='22023'; END IF;
    INSERT INTO p4i_vector.layers(project_id,revision,metadata,created_by,updated_by) VALUES(project,1,doc-'data',actor,actor) RETURNING * INTO existing; lid:=existing.id;
  ELSE
    SELECT * INTO existing FROM p4i_vector.layers WHERE id=lid AND project_id=project FOR UPDATE;
    IF NOT FOUND OR existing.archived THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
    IF existing.revision<>(input->>'expectedRevision')::integer THEN RAISE EXCEPTION 'Revision conflict' USING ERRCODE='PT409'; END IF;
    UPDATE p4i_vector.layers SET revision=revision+1,metadata=doc-'data',archived=(input->>'archive')::boolean,updated_at=clock_timestamp(),updated_by=actor WHERE id=lid RETURNING * INTO existing;
  END IF;
  IF NOT existing.archived THEN
    FOR item IN SELECT value FROM jsonb_array_elements(doc->'data'->'features') LOOP
      ids:=array_append(ids,item->>'id'); g:=public.ST_GeomFromGeoJSON((item->'geometry')::text);
      SELECT * INTO previous FROM p4i_vector.features WHERE layer_id=lid AND local_id=item->>'id';
      IF NOT FOUND THEN
        INSERT INTO p4i_vector.features(layer_id,local_id,revision,geom,properties,ordinal,created_by,updated_by) VALUES(lid,item->>'id',1,g,item->'properties',i,actor,actor) RETURNING * INTO previous;
        INSERT INTO p4i_vector.feature_revisions VALUES(previous.id,lid,1,actor,now(),false,item->'geometry',item->'properties');
      ELSIF previous.properties IS DISTINCT FROM item->'properties' OR public.ST_AsEWKB(previous.geom) IS DISTINCT FROM public.ST_AsEWKB(g) THEN
        UPDATE p4i_vector.features SET geom=g,properties=item->'properties',ordinal=i,revision=revision+1,updated_at=clock_timestamp(),updated_by=actor WHERE id=previous.id RETURNING * INTO previous;
        INSERT INTO p4i_vector.feature_revisions VALUES(previous.id,lid,previous.revision,actor,now(),false,item->'geometry',item->'properties');
      ELSE UPDATE p4i_vector.features SET ordinal=i WHERE id=previous.id;
      END IF;
      i:=i+1;
    END LOOP;
    FOR previous IN SELECT * FROM p4i_vector.features WHERE layer_id=lid AND NOT(local_id=ANY(ids)) LOOP
      INSERT INTO p4i_vector.feature_revisions VALUES(previous.id,lid,previous.revision+1,actor,now(),true,public.ST_AsGeoJSON(previous.geom,15)::jsonb,previous.properties);
      DELETE FROM p4i_vector.features WHERE id=previous.id;
    END LOOP;
  END IF;
  IF (SELECT count(*) FROM p4i_vector.features f JOIN p4i_vector.layers l ON f.layer_id=l.id WHERE l.project_id=project AND NOT l.archived)>100 THEN RAISE EXCEPTION 'Feature budget' USING ERRCODE='22023'; END IF;
  result:=p4i_vector.document(lid);
  -- Conservatively count JSONB text (including whitespace) for project-wide bounded documents.
  IF (SELECT coalesce(sum(octet_length((p4i_vector.document(id)->'layer')::text)),0) FROM p4i_vector.layers WHERE project_id=project AND NOT archived)>65536 THEN RAISE EXCEPTION 'Project byte budget' USING ERRCODE='22023'; END IF;
  INSERT INTO p4i_vector.layer_revisions VALUES(lid,existing.revision,actor,now(),result);
  INSERT INTO p4i_vector.requests VALUES(actor,req,project,public.digest(input::text,'sha256'),result,now());
  RETURN result;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA p4i_vector FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.p4i_vector_store(text,jsonb) FROM PUBLIC, service_role;
GRANT EXECUTE ON FUNCTION public.p4i_vector_store(text,jsonb) TO anon, authenticated;
COMMIT;
