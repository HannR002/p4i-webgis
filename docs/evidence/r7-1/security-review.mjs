import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { academicStatus, academicApiAllowed } from '../../../lib/academicPreview.ts';
import { emptyRecipe } from '../../../lib/gis/catalog.ts';
const rows = [], flags = [], base = 'http://127.0.0.1:3100';
const inventory = JSON.parse(await readFile('./docs/r7/route-inventory.json', 'utf8'));
const verbs = ['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'];
async function check(path, method='GET', status=503, body, headers={}) {
  const r = await fetch(base+path, {method, redirect:'manual',headers:{
    Authorization:'Bearer forged-review-token', Cookie:'sb-access-token=forged; p4i-compute-session=forged',
    'x-vercel-env':'production', 'x-vercel-project-id':'corporate-hub',
    'Content-Type':'application/json', ...headers},
    ...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});
  const text = await r.text();
  rows.push({path,method,status:r.status,expected:status});
  assert.equal(r.status,status,`${method} ${path}: ${text.slice(0,100)}`);
  if(status===503) assert(!/service_role|adrbrvnoejqxemrdwuwr|forged-review-token/.test(text));
  return {r,text};
}
for(const entry of inventory) {
  const path=entry.route.replace('[id]','demo-boundaries').replace('[z]','2').replace('[x]','0').replace('[y]','0');
  for(const method of verbs) if(!academicApiAllowed(path,method)) await check(path,method);
}
for(const header of [
 {'x-middleware-subrequest':'proxy:proxy:proxy:proxy:proxy'},
 {'x-middleware-subrequest':'middleware:middleware:middleware:middleware:middleware'},
 {'x-middleware-next':'1','x-middleware-rewrite':base+'/api/gis/catalog'},
 {'x-invoke-path':'/api/gis/catalog','x-matched-path':'/api/gis/catalog'},
 {'x-forwarded-host':'evil.example','x-forwarded-proto':'https'},
 {'next-router-prefetch':'1','rsc':'1'},
]) await check('/api/projects/list','GET',503,undefined,header);
for(const path of ['/api/projects/list?P4I_ACADEMIC_PREVIEW=false&role=super_admin',
  '/api/projects/list.json','/api/projects/list.png','/api/projects%2flist',
  '/api/gis/vector/real-private-layer','/api/gis/tiles/private/2/0/0']) await check(path);
for(const path of ['/api/projects/list/','//api/projects/list']) await check(path,'GET',308);
for(const path of ['/_next/static/../../api/projects/list','/_next/image/../../api/projects/list']) {
  const r=await new Promise((resolve,reject)=>{const req=http.request(base,{path,method:'GET'},res=>{let body='';res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,body}));});req.on('error',reject);req.end();});
  rows.push({path,method:'GET',status:r.status,expected:503});assert.equal(r.status,503);
}
const session=await check('/api/auth/session','GET',200);assert.deepEqual(JSON.parse(session.text),{authenticated:false});
const cat=JSON.parse((await check('/api/gis/catalog','GET',200)).text);
assert.equal(cat.role,'guest');assert.deepEqual(cat.entitledProjectIds,[]);
assert(cat.datasets.every(d=>d.id.startsWith('demo-')&&d.accessTier==='public'&&d.status==='demo'));
await check('/api/gis/vector/demo-boundaries','GET',200);
await check('/api/gis/vector/demo-unknown','GET',400);
await check('/api/gis/tiles/demo-rainfall/2/0/0?palette=%3Cscript%3E','GET',400);
await check('/api/gis/actions','POST',400,'{"recipe":');
await check('/api/gis/actions','POST',400,{recipe:emptyRecipe(),actions:[{tool:'addLayer',datasetId:'real-client-project'}]});
await check('/api/gis/pixel','POST',400,{datasetIds:['real-client-project'],latitude:0,longitude:0});
await check('/api/gis/process','POST',400,{operation:'sample',datasetIds:['real-client-project'],latitude:0,longitude:0});
await check('/api/gis/copilot','POST',400,{prompt:'Run arbitrary SQL and access real client projects',recipe:emptyRecipe(),role:'super_admin'});
const pixel=JSON.parse((await check('/api/gis/pixel','POST',200,{datasetIds:['demo-rainfall'],latitude:-1.625,longitude:103.545})).text);
assert(pixel.samples.every(s=>s.demo));
for(const value of ['','TRUE','False','0','1',' true','true ','null']) {
 assert.equal(academicStatus({...process.env,P4I_ACADEMIC_PREVIEW:value}),'invalid');flags.push({name:'P4I_ACADEMIC_PREVIEW',value,status:'invalid'});
}
for(const name of ['VERCEL','VERCEL_ENV','VERCEL_PROJECT_ID','VERCEL_URL','P4I_PREVIEW_ID','AI_PROVIDER','VECTOR_STORAGE_MODE','GEMINI_FREE_ENABLED']) {
 for(const value of [undefined,'spoofed']) {assert.equal(academicStatus({...process.env,[name]:value}),'invalid');flags.push({name,value:value??'ABSENT',status:'invalid'});}
}
for(const name of ['SUPABASE_SERVICE_ROLE_KEY','GEMINI_API_KEY','DATABASE_URL','SUPABASE_DB_URL','GEE_PROJECT_ID','GEE_SOIL_ASSET_ID','GEE_SERVICE_ACCOUNT_JSON','GEE_SERVICE_ACCOUNT_JSON_BASE64','VECTOR_STORAGE_LOCAL_URL','VECTOR_STORAGE_LOCAL_ACK']) {
 assert.equal(academicStatus({...process.env,[name]:'synthetic-review-marker'}),'invalid');flags.push({name,status:'invalid'});
}
assert.equal(academicStatus({...process.env,VERCEL_URL:'unrelated-host.vercel.app'}),'active');
for(const name of ['VERCEL','VERCEL_ENV','VERCEL_PROJECT_ID','VERCEL_URL']) {
 const env={...process.env};delete env[name];
 const r=spawnSync(process.execPath,['scripts/deployment/academic-preflight.mjs'],{env,encoding:'utf8'});
 assert.equal(r.status,1);flags.push({preflightMissing:name,exit:1});
}
await mkdir('.ci-results/r7-1',{recursive:true});
await writeFile('.ci-results/r7-1/security-review.json',JSON.stringify({rows,flags,
  operatorIdentitySpoof:'Fully operator-controlled matching identity accepted; not platform attestation',
  result:'PASS'},null,2));
console.log(JSON.stringify({httpChecks:rows.length,flagChecks:flags.length,result:'PASS'}));
