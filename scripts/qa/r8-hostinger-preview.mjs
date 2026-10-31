// Local-only acceptance. The reserved hostname and credentials below are test fixtures, never deployment defaults.
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { academicApiAllowed } from '../../lib/academicPreview.ts';
import { emptyRecipe } from '../../lib/gis/catalog.ts';
const dir=process.env.P4I_QA_ARTIFACTS || '.ci-results/r8';
await mkdir(dir,{recursive:true});
const host='webgis-r8.example.test';
const authorization='Basic '+Buffer.from('qa-supervisor:local-test-only-r8-password-do-not-deploy').toString('base64');
const checks=[];
function send(path,method='GET',body,headers={}) {
  return new Promise((resolve,reject)=>{
    const req=http.request({hostname:'127.0.0.1',port:3100,path,method,headers:{host,authorization,'Content-Type':'application/json',
      Cookie:'sb-access-token=forged; role=super_admin','x-vercel-env':'preview','x-forwarded-host':host,...headers}},res=>{
      let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text}));
    });req.on('error',reject);if(body!==undefined)req.write(typeof body==='string'?body:JSON.stringify(body));req.end();
  });
}
async function check(path,method='GET',expected=503,body,headers) {
  const r=await send(path,method,body,headers);checks.push({path,method,status:r.status,expected});
  assert.equal(r.status,expected,`${method} ${path}: ${r.text.slice(0,100)}`);return r;
}
const inventory=JSON.parse(await readFile('docs/r7/route-inventory.json','utf8'));
for(const entry of inventory){
  const path=entry.route.replace('[id]','demo-boundaries').replace('[z]','2').replace('[x]','0').replace('[y]','0');
  for(const method of ['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'])
    if(!academicApiAllowed(path,method))await check(path,method);
}
for(const path of ['/','/spatial/viewer','/api/gis/catalog','/api/academic/status','/_next/image','/favicon.ico','/gis/previews/climate.png']) {
  const denied=await check(path,'GET',401,undefined,{authorization:''});
  assert.match(denied.headers['www-authenticate'],/^Basic /);assert.equal(denied.headers['cache-control'],'private, no-store');
}
for(const header of [
  {authorization:'Bearer forged'}, {authorization:'Basic !!!'},
  {authorization:'', 'x-middleware-subrequest':'proxy:proxy:proxy:proxy:proxy'},
  {authorization:'','x-middleware-next':'1','x-invoke-path':'/api/gis/catalog'},
])await check('/api/academic/status','GET',401,undefined,header);
for(const badHost of ['evil.example.test','p4ijournal.org','journal.p4ijournal.org','publisher.p4ijournal.org'])
  await check('/api/academic/status','GET',503,undefined,{host:badHost,'x-forwarded-host':host});
const status=JSON.parse((await check('/api/academic/status','GET',200)).text);
assert.equal(status.deploymentProvider,'hostinger');assert.equal(status.enabled,true);assert.equal(status.identity,'guest');
assert.equal(status.database,'unavailable');assert.equal(status.externalAI,false);assert.equal(status.sourceRevision,process.env.P4I_SOURCE_REVISION);
const catalog=JSON.parse((await check('/api/gis/catalog','GET',200)).text);
assert.equal(catalog.role,'guest');assert.deepEqual(catalog.entitledProjectIds,[]);
assert(catalog.datasets.every(d=>d.accessTier==='public'&&d.id.startsWith('demo-')&&d.status==='demo'));
assert.deepEqual(JSON.parse((await check('/api/auth/session','GET',200)).text),{authenticated:false});
await check('/api/gis/vector/demo-boundaries','GET',200);
await check('/api/gis/vector/private-client','GET',503);
await check('/api/gis/pixel','POST',400,{datasetIds:['private-client'],latitude:0,longitude:0});
await check('/api/gis/actions','POST',400,'{"recipe":');
await check('/api/gis/pixel','POST',400,{x:'x'.repeat(65536)});
const plan=JSON.parse((await check('/api/gis/copilot','POST',200,{prompt:'Buatkan peta baru bernama Uji Hostinger dan gunakan tanpa basemap.',recipe:emptyRecipe(),configurations:[]})).text);
assert.equal(plan.recipe.title,'Uji Hostinger');assert.equal(plan.plan.provider.mode,'demo');
async function files(dir){const out=[];for(const item of await readdir(dir,{withFileTypes:true})){const path=dir+'/'+item.name;if(item.isDirectory())out.push(...await files(path));else out.push(path);}return out;}
const assets=(await files('.next/static')).filter(p=>/\.(js|css)$/.test(p));assert(assets.length>0);
for(const file of assets){const text=await readFile(file,'utf8');assert(!text.includes(process.env.P4I_HOSTINGER_PASSWORD_SHA256));}
for(const file of [assets.find(p=>p.endsWith('.js')),assets.find(p=>p.endsWith('.css'))]){
  assert(file);const path=file.replace('.next','/_next');
  await check(path,'GET',401,undefined,{authorization:''});await check(path,'GET',200);
}
await writeFile(dir+'/results.json',JSON.stringify({result:'PASS',checks,assetsScanned:assets.length,status,
  source:'LOCAL_HOSTINGER_CONTRACT_FIXTURE_ONLY',realHostingerHostnameAssigned:false},null,2));
console.log(JSON.stringify({result:'PASS',httpChecks:checks.length,assetsScanned:assets.length}));
