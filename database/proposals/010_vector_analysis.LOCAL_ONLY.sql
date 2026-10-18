-- Additive, disposable fixture only. No tables or production migration changes.
BEGIN;
DO $$ BEGIN
 IF current_database()<>'p4i_phase15_local' OR current_setting('p4i.local_fixture',true) IS DISTINCT FROM 'synthetic-only' THEN RAISE EXCEPTION 'BLOCKED: local synthetic fixture required'; END IF;
END $$;
-- Must be set before the RPC statement begins; SET inside a function does not establish a running statement's deadline.
ALTER ROLE authenticator SET statement_timeout='3s';
ALTER ROLE authenticator SET lock_timeout='500ms';
CREATE FUNCTION public.p4i_vector_analyze(input jsonb, preview boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,p4i_vector AS $$
DECLARE
 actor uuid:=auth.uid(); project uuid; op text; params jsonb; ref jsonb; item record; part record;
 a public.geometry[]:='{}'; b public.geometry[]:='{}'; props jsonb[]:='{}'; groups jsonb[]:='{}';
 g public.geometry; ga public.geometry; gb public.geometry; extent public.box2d; output public.geometry[]:='{}'; attrs jsonb[]:='{}';
 ids uuid[]; n integer; vertices integer:=0; total integer:=0; idx integer:=0; j integer; zone integer; sr integer; measured_value double precision; unit text;
 features jsonb:='[]'; layer jsonb; result jsonb; result_props jsonb; raw_type text; key jsonb;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF input IS NULL OR jsonb_typeof(input)<>'object' OR octet_length(input::text)>8192 OR NOT input ?& ARRAY['operation','projectId','source','target','parameters'] OR EXISTS(SELECT 1 FROM jsonb_object_keys(input) k WHERE k NOT IN ('operation','projectId','source','target','parameters')) THEN RAISE EXCEPTION 'Invalid input' USING ERRCODE='22023'; END IF;
 project:=(input->>'projectId')::uuid; op:=input->>'operation'; params:=input->'parameters';
 -- Analysts must be assigned to the project; clients cannot start compute or persist results.
 PERFORM p4i_vector.authorize(project,true);
 IF op IS NULL OR op NOT IN ('buffer','intersection','union','difference','clip','dissolve','intersects','within','area','length','distance') OR jsonb_typeof(params)<>'object' THEN RAISE EXCEPTION 'Invalid operation' USING ERRCODE='22023'; END IF;
 IF (op IN ('intersection','union','difference','clip','intersects','within','distance')) IS DISTINCT FROM (jsonb_typeof(input->'target')='object') THEN RAISE EXCEPTION 'Invalid sources' USING ERRCODE='22023'; END IF;
 IF op NOT IN ('intersection','union','difference','clip','intersects','within','distance') AND input->'target'<>'null'::jsonb THEN RAISE EXCEPTION 'Invalid target' USING ERRCODE='22023'; END IF;
 IF op='buffer' THEN
  IF NOT params ? 'distanceMetres' OR (SELECT count(*) FROM jsonb_object_keys(params))<>1 OR jsonb_typeof(params->'distanceMetres')<>'number' OR (params->>'distanceMetres')::numeric NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Buffer metres 1..10000' USING ERRCODE='22023'; END IF;
 ELSIF op='dissolve' THEN
  IF NOT params ? 'attribute' OR (SELECT count(*) FROM jsonb_object_keys(params))<>1 OR jsonb_typeof(params->'attribute')<>'string' OR params->>'attribute' !~ '^[a-zA-Z][a-zA-Z0-9_]{0,31}$' OR params->>'attribute' IN ('constructor','prototype','__proto__') THEN RAISE EXCEPTION 'Invalid attribute' USING ERRCODE='22023'; END IF;
 ELSIF op IN ('area','length','distance') THEN
  unit:=params->>'unit';
  IF (SELECT count(*) FROM jsonb_object_keys(params))<>1 OR unit IS NULL OR (op='area' AND unit NOT IN ('m2','ha')) OR (op<>'area' AND unit NOT IN ('m','km')) THEN RAISE EXCEPTION 'Invalid unit' USING ERRCODE='22023'; END IF;
 ELSIF params<>'{}'::jsonb THEN RAISE EXCEPTION 'Unexpected parameters' USING ERRCODE='22023'; END IF;
 -- Fixed DB-wide two slots + one per actor, transaction released. No caller-controlled approval bypass.
 IF NOT pg_try_advisory_xact_lock(16016,hashtext(actor::text)) THEN RAISE EXCEPTION 'Busy' USING ERRCODE='PT429'; END IF;
 IF NOT pg_try_advisory_xact_lock(16017,1) AND NOT pg_try_advisory_xact_lock(16017,2) THEN RAISE EXCEPTION 'Busy' USING ERRCODE='PT429'; END IF;
 FOR j IN 0..1 LOOP
  ref:=CASE WHEN j=0 THEN input->'source' ELSE input->'target' END;
  IF ref='null'::jsonb THEN CONTINUE; END IF;
  IF jsonb_typeof(ref)<>'object' OR NOT ref ?& ARRAY['layerId','revision','featureIds'] OR EXISTS(SELECT 1 FROM jsonb_object_keys(ref) k WHERE k NOT IN ('layerId','revision','featureIds')) OR jsonb_typeof(ref->'featureIds')<>'array' OR jsonb_array_length(ref->'featureIds') NOT BETWEEN 1 AND 20 OR jsonb_typeof(ref->'revision')<>'number' OR ref->>'revision' !~ '^[1-9][0-9]*$' THEN RAISE EXCEPTION 'Invalid reference' USING ERRCODE='22023'; END IF;
  -- A layer from another project fails even if its identifier is known. Lock protects snapshot revisions during computation.
  SELECT revision INTO n FROM p4i_vector.layers WHERE id=(ref->>'layerId')::uuid AND project_id=project AND NOT archived FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
  IF n<>(ref->>'revision')::integer THEN RAISE EXCEPTION 'Stale source revision' USING ERRCODE='PT409'; END IF;
  SELECT array_agg(entry.value::uuid) INTO ids FROM jsonb_array_elements_text(ref->'featureIds') entry;
  IF cardinality(ids)<>(SELECT count(DISTINCT id) FROM unnest(ids) id) THEN RAISE EXCEPTION 'Duplicate features' USING ERRCODE='22023'; END IF;
  IF cardinality(ids)<>(SELECT count(*) FROM p4i_vector.features WHERE layer_id=(ref->>'layerId')::uuid AND id=ANY(ids)) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
  FOR item IN SELECT * FROM p4i_vector.features WHERE layer_id=(ref->>'layerId')::uuid AND id=ANY(ids) ORDER BY array_position(ids,id) LOOP
   IF NOT ST_IsValid(item.geom) OR ST_SRID(item.geom)<>4326 OR ST_NDims(item.geom)<>2 THEN RAISE EXCEPTION 'Invalid source geometry' USING ERRCODE='22023'; END IF;
   vertices:=vertices+ST_NPoints(item.geom); total:=total+1;
   IF j=0 THEN a:=array_append(a,item.geom); props:=array_append(props,item.properties);
   ELSE b:=array_append(b,item.geom); END IF;
  END LOOP;
 END LOOP;
 IF total>40 OR vertices>2048 THEN RAISE EXCEPTION 'Resource ceiling exceeded' USING ERRCODE='22023'; END IF;
 SELECT ST_Extent(v)::box2d INTO extent FROM unnest(a||b) v;
 IF ST_XMax(extent)-ST_XMin(extent)>1 OR ST_YMax(extent)-ST_YMin(extent)>1 OR ST_YMin(extent)<-70 OR ST_YMax(extent)>70 OR ST_XMin(extent)<-179 OR ST_XMax(extent)>179 THEN RAISE EXCEPTION 'Extent or latitude unsupported' USING ERRCODE='22023'; END IF;
 IF preview IS NULL THEN RAISE EXCEPTION 'Invalid preview' USING ERRCODE='22023'; END IF;
 IF preview THEN RETURN jsonb_build_object('features',total,'vertices',vertices,'pairTests',cardinality(a)*cardinality(b),'costClass','LOW_COST_ANALYSIS'); END IF;
 ga:=ST_UnaryUnion(ST_Collect(a)); gb:=CASE WHEN cardinality(b)>0 THEN ST_UnaryUnion(ST_Collect(b)) ELSE NULL END;
 IF op='buffer' THEN
  zone:=floor((ST_XMin(extent)+180)/6)+1;
  IF zone<>floor((ST_XMax(extent)+180)/6)+1 OR (ST_YMin(extent)<0 AND ST_YMax(extent)>=0) THEN RAISE EXCEPTION 'Buffer crosses UTM zone/hemisphere' USING ERRCODE='22023'; END IF;
  sr:=CASE WHEN ST_YMax(extent)<0 THEN 32700 ELSE 32600 END+zone;
  output:=ARRAY[ST_Transform(ST_Buffer(ST_Transform(ga,sr),(params->>'distanceMetres')::float8,'quad_segs=8'),4326)];
 ELSIF op IN ('intersection','clip') THEN
  IF op='clip' AND ST_Dimension(gb)<>2 THEN RAISE EXCEPTION 'Clip mask must contain only polygons' USING ERRCODE='22023'; END IF;
  IF op='clip' AND EXISTS(SELECT 1 FROM unnest(b) v WHERE GeometryType(v) NOT IN ('POLYGON','MULTIPOLYGON')) THEN RAISE EXCEPTION 'Polygon mask required' USING ERRCODE='22023'; END IF;
  output:=ARRAY[ST_Intersection(ga,gb)];
 ELSIF op='union' THEN output:=ARRAY[ST_Union(ga,gb)];
 ELSIF op='difference' THEN output:=ARRAY[ST_Difference(ga,gb)];
 ELSIF op IN ('intersects','within') THEN
  IF op='within' AND (EXISTS(SELECT 1 FROM unnest(a) v WHERE GeometryType(v)<>'POINT') OR EXISTS(SELECT 1 FROM unnest(b) v WHERE GeometryType(v) NOT IN ('POLYGON','MULTIPOLYGON'))) THEN RAISE EXCEPTION 'Within requires points and polygon mask' USING ERRCODE='22023'; END IF;
  FOR j IN 1..cardinality(a) LOOP
   IF (op='intersects' AND ST_Intersects(a[j],gb)) OR (op='within' AND ST_Within(a[j],gb)) THEN output:=array_append(output,a[j]); attrs:=array_append(attrs,jsonb_build_object('sourceFeature',input->'source'->'featureIds'->>(j-1))); END IF;
  END LOOP;
 ELSIF op='dissolve' THEN
  FOR j IN 1..cardinality(a) LOOP
   key:=props[j]->'attributes'->(params->>'attribute');
   IF key IS NULL THEN RAISE EXCEPTION 'Dissolve attribute missing' USING ERRCODE='22023'; END IF;
   IF NOT key=ANY(groups) THEN
    groups:=array_append(groups,key);
    SELECT ST_UnaryUnion(ST_Collect(a[k])) INTO g FROM generate_subscripts(a,1) k WHERE props[k]->'attributes'->(params->>'attribute')=key;
    output:=array_append(output,g); attrs:=array_append(attrs,jsonb_build_object('groupValue',key));
   END IF;
  END LOOP;
 ELSIF op IN ('area','length') THEN
  FOR j IN 1..cardinality(a) LOOP
   IF (op='area' AND GeometryType(a[j]) NOT IN ('POLYGON','MULTIPOLYGON')) OR (op='length' AND GeometryType(a[j]) NOT IN ('LINESTRING','MULTILINESTRING')) THEN RAISE EXCEPTION 'Measurement geometry mismatch' USING ERRCODE='22023'; END IF;
   measured_value:=CASE WHEN op='area' THEN ST_Area(a[j]::geography,true) ELSE ST_Length(a[j]::geography,true) END;
   IF unit='ha' THEN measured_value:=measured_value/10000; ELSIF unit='km' THEN measured_value:=measured_value/1000; END IF;
   output:=array_append(output,a[j]); attrs:=array_append(attrs,jsonb_build_object('value',measured_value,'unit',unit));
  END LOOP;
 ELSIF op='distance' THEN
  -- Minimum spheroidal distance among bounded source/target pairs; retain source geometries, do not invent a connector.
  SELECT min(ST_Distance(x::geography,y::geography,true)) INTO measured_value FROM unnest(a) x CROSS JOIN unnest(b) y;
  IF unit='km' THEN measured_value:=measured_value/1000; END IF;
  output:=a; FOR j IN 1..cardinality(a) LOOP attrs:=array_append(attrs,jsonb_build_object('value',measured_value,'unit',unit)); END LOOP;
 END IF;
 FOR j IN 1..cardinality(output) LOOP
  g:=output[j];
  IF ST_IsEmpty(g) THEN CONTINUE; END IF;
  IF NOT ST_IsValid(g) THEN RAISE EXCEPTION 'Invalid result (not repaired)' USING ERRCODE='22023'; END IF;
  -- Preserve supported multipart types. Dump every collection/MultiPoint component without dimension filtering.
  FOR part IN SELECT g AS geom WHERE GeometryType(g) IN ('POINT','LINESTRING','POLYGON','MULTILINESTRING','MULTIPOLYGON')
   UNION ALL SELECT (ST_Dump(g)).geom WHERE GeometryType(g) IN ('GEOMETRYCOLLECTION','MULTIPOINT') LOOP
   raw_type:=GeometryType(part.geom);
   IF raw_type NOT IN ('POINT','LINESTRING','POLYGON','MULTILINESTRING','MULTIPOLYGON') OR ST_NPoints(part.geom)>512 OR NOT ST_IsValid(part.geom) THEN RAISE EXCEPTION 'Unsupported/oversized result' USING ERRCODE='22023'; END IF;
   idx:=idx+1; IF idx>100 THEN RAISE EXCEPTION 'Output feature limit' USING ERRCODE='22023'; END IF;
   result_props:=jsonb_build_object('name',op||' '||idx,'description','Synthetic local PostGIS computation; original source unchanged','attributes',coalesce(attrs[j],'{}'::jsonb)||jsonb_build_object('operation',op,'sourceCRS','EPSG:4326','sourceProject',project,'sourceLayer',input->'source'->>'layerId','sourceRevision',(input->'source'->>'revision')::integer,'targetLayer',coalesce(input->'target'->>'layerId',''),'targetRevision',coalesce((input->'target'->>'revision')::integer,0),'requestHash',encode(public.digest(input::text,'sha256'),'hex'),'parameters',params::text));
   features:=features||jsonb_build_array(jsonb_build_object('type','Feature','id','local-feature-'||idx,'geometry',ST_AsGeoJSON(part.geom,15)::jsonb,'properties',result_props));
  END LOOP;
 END LOOP;
 layer:=jsonb_build_object('id','local-vector-1','name','Hasil '||op||' PostGIS','visible',true,'opacity',1,'style',jsonb_build_object('color','#b45309','fillColor','#f59e0b','weight',2,'fillOpacity',0.35,'radius',6),'data',jsonb_build_object('type','FeatureCollection','features',features));
 PERFORM p4i_vector.validate_layer(layer);
 result:=jsonb_build_object('request',input,'engine','PostGIS','crs','EPSG:4326','metric','WGS84 spheroid / local UTM buffer','createdAt',clock_timestamp(),'estimate',jsonb_build_object('features',total,'vertices',vertices,'pairTests',cardinality(a)*cardinality(b),'costClass','LOW_COST_ANALYSIS'),'warnings',jsonb_build_array('Data sintetis lokal. Bukan pengukuran survei atau publikasi.','Overlay memakai segmen planar EPSG:4326 dalam extent terbatas; within tidak mencakup batas polygon.'),'layer',layer);
 IF octet_length(result::text)>65536 THEN RAISE EXCEPTION 'Output byte limit' USING ERRCODE='22023'; END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.p4i_vector_analyze(jsonb,boolean) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.p4i_vector_analyze(jsonb,boolean) TO authenticated;
COMMIT;
