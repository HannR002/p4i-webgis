// Local Docker-only rehearsal. No DATABASE_URL, Supabase credentials or remote
// Docker endpoints are accepted. The foundation is explicitly a TEST FIXTURE.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { foundationStatus, migrationPlan } from './migration-plan.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
assert(
  args.length === 0 || (args.length === 2 && args[0] === '--output'),
  'Usage: node scripts/database/rehearse.mjs [--output /path]',
);
const output = resolve(args[1] ?? '/tmp/p4i-phase08-rehearsal');
mkdirSync(output, { recursive: true });
rmSync(resolve(output, 'summary.json'), { force: true });
const images = {
  database:
    'postgis/postgis:16-3.5@sha256:94146ac37bc61e2322f88016056c5920729cb8c64c8542ed590af8fc2abdac07',
  api: 'postgrest/postgrest:v12.2.12@sha256:5f4ce744539bbba786b4e24dbbd95bdb2a956dcf568c5374995a0ff4a68f5bd2',
};
const dockerEnv = { ...process.env };
for (const name of [
  'DOCKER_HOST',
  'DOCKER_CONTEXT',
  'DOCKER_TLS',
  'DOCKER_TLS_VERIFY',
  'DOCKER_CERT_PATH',
])
  delete dockerEnv[name];
function docker(args, { input, env, allowFailure = false } = {}) {
  const result = spawnSync(
    'docker',
    ['--host=unix:///var/run/docker.sock', ...args],
    {
      env: { ...dockerEnv, ...env },
      input,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      timeout: 120_000,
    },
  );
  if (!allowFailure && result.status !== 0)
    throw new Error(
      `Docker ${args[0]} failed: ${(result.stderr || result.error?.message || '').slice(0, 2000)}`,
    );
  return result;
}
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const plan = migrationPlan();
const summary = {
  generatedAt: new Date().toISOString(),
  mode: 'LOCAL_SYNTHETIC_FOUNDATION_ONLY',
  externalChanges: false,
  foundation: foundationStatus,
  images,
  migrations: plan,
  cycles: [],
};
const users = Object.fromEntries(
  ['clientA', 'clientB', 'analyst', 'admin', 'disabled'].map((name, i) => [
    name,
    `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${i + 1}`,
  ]),
);
const projects = [1, 2, 3].map(
  (i) => `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb${i}`,
);

for (let cycle = 1; cycle <= 2; cycle++) {
  const suffix = randomBytes(6).toString('hex');
  const network = `p4i-db08-${suffix}`;
  const db = `${network}-db`;
  const api = `${network}-api`;
  const secret = randomBytes(48).toString('hex');
  const checks = [];
  const sql = (input, allowFailure = false) =>
    docker(
      [
        'exec',
        '-i',
        db,
        'psql',
        '-X',
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        'postgres',
        '-d',
        'p4i_rehearsal',
        '-At',
      ],
      { input, allowFailure },
    );
  const file = (path) => readFileSync(resolve(root, path), 'utf8');
  const check = (name, action) => {
    action();
    checks.push(name);
  };
  try {
    console.log(
      `Cycle ${cycle}: creating isolated synthetic PostgreSQL/PostGIS instance`,
    );
    docker(['network', 'create', '--internal', network]);
    docker([
      'run',
      '-d',
      '--name',
      db,
      '--network',
      network,
      '--network-alias',
      'database',
      '--tmpfs',
      '/var/lib/postgresql/data:rw',
      '-e',
      'POSTGRES_DB=p4i_rehearsal',
      '-e',
      'POSTGRES_HOST_AUTH_METHOD=trust',
      images.database,
    ]);
    // Trust is confined to a unique internal network with NO database port publication.
    let ready = false;
    for (let i = 0; i < 60; i++) {
      if (
        docker(
          [
            'exec',
            db,
            'pg_isready',
            '-h',
            '127.0.0.1',
            '-U',
            'postgres',
            '-d',
            'p4i_rehearsal',
          ],
          { allowFailure: true },
        ).status === 0
      ) {
        ready = true;
        break;
      }
      await sleep(500);
    }
    assert(ready, 'PostgreSQL readiness timeout');
    check('missing foundation preflight fails', () =>
      assert.notEqual(
        sql(file('scripts/database/preflight.sql'), true).status,
        0,
      ),
    );
    sql(file('tests/database/synthetic-foundation.sql'));
    sql(file('scripts/database/preflight.sql'));
    checks.push('synthetic foundation preflight passes');
    for (const item of plan) {
      sql(file(`supabase_migrations/${item.file}`));
      checks.push(`migration ${item.order}: ${item.file}`);
    }
    sql(file('scripts/database/verify-security.sql'));
    checks.push('catalog security invariants verified');
    sql(file('tests/database/seed.sql'));
    check('existing populated database preflight fails', () =>
      assert.notEqual(
        sql(file('scripts/database/preflight.sql'), true).status,
        0,
      ),
    );
    check('malicious signup metadata cannot assign role', () =>
      assert.equal(
        sql(
          `SELECT role FROM public.user_profiles WHERE id='${users.clientA}';`,
        ).stdout.trim(),
        'b2b_client',
      ),
    );
    const version = sql(
      'SELECT version(); SELECT PostGIS_Full_Version();',
    ).stdout.trim();
    // A low-privilege authenticator switches only into named roles per signed JWT.
    docker(
      [
        'create',
        '--name',
        api,
        '--network',
        'bridge',
        '-p',
        '127.0.0.1::3000',
        '-e',
        'PGRST_DB_URI=postgres://authenticator@database:5432/p4i_rehearsal',
        '-e',
        'PGRST_DB_SCHEMAS=public',
        '-e',
        'PGRST_DB_ANON_ROLE=anon',
        '-e',
        'PGRST_JWT_SECRET',
        '-e',
        'PGRST_DB_MAX_ROWS=100',
        images.api,
      ],
      { env: { PGRST_JWT_SECRET: secret } },
    );
    docker(['network', 'connect', network, api]);
    docker(['start', api]);
    const port = docker(['port', api, '3000/tcp'])
      .stdout.trim()
      .split(':')
      .at(-1);
    const base = `http://127.0.0.1:${port}`;
    const token = (who, overrides = {}) => {
      const encode = (object) =>
        Buffer.from(JSON.stringify(object)).toString('base64url');
      const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role: who === 'service' ? 'service_role' : 'authenticated', sub: users[who], exp: Math.floor(Date.now() / 1000) + 300, ...overrides })}`;
      return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
    };
    async function request(
      path,
      who = 'guest',
      method = 'GET',
      body,
      overrides,
    ) {
      const response = await fetch(`${base}/${path}`, {
        method,
        headers: {
          ...(who === 'guest'
            ? {}
            : { Authorization: `Bearer ${token(who, overrides)}` }),
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await response.text();
      return { status: response.status, body: text ? JSON.parse(text) : null };
    }
    ready = false;
    for (let i = 0; i < 60; i++) {
      try {
        if ((await request('spatial_projects?select=id')).status === 200) {
          ready = true;
          break;
        }
      } catch {}
      await sleep(500);
    }
    assert(ready, 'PostgREST readiness timeout');
    const denied = (response) =>
      assert(
        [401, 403].includes(response.status),
        `Expected denied; received ${response.status}`,
      );
    const expected = {
      guest: [0],
      clientA: [0, 1],
      clientB: [0, 2],
      analyst: [0, 1, 2],
      admin: [0, 1, 2],
      disabled: [0],
    };
    for (const [who, indices] of Object.entries(expected)) {
      for (const table of ['spatial_projects', 'vector_layers']) {
        const key = table === 'spatial_projects' ? 'id' : 'project_id';
        const result = await request(`${table}?select=${key}`, who);
        check(`${who} ${table} exact authorized rows`, () => {
          assert.equal(result.status, 200);
          assert.deepEqual(
            result.body.map((row) => row[key]).sort(),
            indices.map((i) => projects[i]).sort(),
          );
        });
      }
      for (const table of [
        'user_profiles',
        'audit_logs',
        'sales_leads',
        'analysis_reports',
        'smce_criteria_weights',
        'vw_vector_layers_geojson',
        'vw_spatial_projects',
        'administrative_boundaries',
        'administrative_boundaries_import_staging',
      ]) {
        const result = await request(`${table}?select=*`, who);
        check(`${who} denied direct ${table}`, () => denied(result));
      }
      for (const [method, body] of [
        ['POST', { title: 'UNAUTHORIZED', access_tier: 'public' }],
        ['PATCH', { title: 'UNAUTHORIZED' }],
        ['DELETE', undefined],
      ]) {
        const result = await request(
          `spatial_projects?id=eq.${projects[0]}`,
          who,
          method,
          body,
        );
        check(`${who} denied project ${method}`, () => denied(result));
      }
      for (const [path, body] of [
        ['user_profiles', { role: 'super_admin' }],
        ['b2b_entitlements', { project_id: projects[2] }],
        ['vector_layers', { layer_name: 'UNAUTHORIZED' }],
        ['download_history', { file_type: 'image_export' }],
      ]) {
        const result = await request(path, who, 'PATCH', body);
        check(`${who} denied protected ${path} mutation`, () => denied(result));
      }
      const flood = await request(
        'flood_analysis_results?select=cache_key',
        who,
      );
      check(`${who} flood cache isolation`, () => {
        if (who === 'guest') denied(flood);
        else {
          assert.equal(flood.status, 200);
          assert.equal(
            flood.body.length,
            ['analyst', 'admin'].includes(who) ? 1 : 0,
          );
        }
      });
      const downloads = await request(
        'download_history?select=client_user_id,project_id',
        who,
      );
      check(`${who} protected download metadata`, () => {
        if (who === 'guest') denied(downloads);
        else {
          assert.equal(downloads.status, 200);
          assert.deepEqual(
            downloads.body,
            ['clientA', 'clientB'].includes(who)
              ? [
                  {
                    client_user_id: users[who],
                    project_id: projects[who === 'clientA' ? 1 : 2],
                  },
                ]
              : [],
          );
        }
      });
      const grants = await request(
        'b2b_entitlements?select=client_user_id',
        who,
      );
      check(`${who} entitlement metadata isolation`, () => {
        if (who === 'guest') denied(grants);
        else {
          assert.equal(grants.status, 200);
          assert.equal(
            grants.body.length,
            who === 'admin' ? 3 : ['clientA', 'clientB'].includes(who) ? 1 : 0,
          );
        }
      });
      for (const [rpc, body] of [
        ['get_project_vector_layers_geojson', { p_project_id: projects[1] }],
        [
          'get_boundaries_in_view',
          {
            p_west: -1,
            p_south: -1,
            p_east: 2,
            p_north: 2,
            p_level: 'provinsi',
          },
        ],
        [
          'promote_administrative_boundary_import',
          { p_batch_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' },
        ],
      ]) {
        const result = await request(`rpc/${rpc}`, who, 'POST', body);
        check(`${who} denied internal RPC ${rpc}`, () => denied(result));
      }
    }
    const forged = await request(
      'rpc/get_current_user_role',
      'clientA',
      'POST',
      {},
      {
        user_metadata: { role: 'super_admin' },
        app_metadata: { role: 'super_admin' },
      },
    );
    check('JWT metadata role forgery ignored', () => {
      assert.equal(forged.status, 200);
      assert.equal(forged.body, 'b2b_client');
    });
    const missing = await request(
      'spatial_projects?select=id',
      'clientA',
      'GET',
      undefined,
      { sub: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9' },
    );
    check('missing profile only public rows', () =>
      assert.deepEqual(missing.body, [{ id: projects[0] }]),
    );
    const expired = await request(
      'spatial_projects?select=id',
      'clientA',
      'GET',
      undefined,
      { exp: 1 },
    );
    check('expired token rejected', () => assert.equal(expired.status, 401));
    const unsigned = await fetch(`${base}/spatial_projects`, {
      headers: { Authorization: 'Bearer invalid.token.signature' },
    });
    check('invalid token rejected', () => assert.equal(unsigned.status, 401));
    const boundary = await request(
      'rpc/get_boundaries_in_view',
      'service',
      'POST',
      { p_west: -1, p_south: -1, p_east: 2, p_north: 2, p_level: 'provinsi' },
    );
    check('trusted server bounded PostGIS RPC works', () => {
      assert.equal(boundary.status, 200);
      assert.equal(boundary.body.length, 1);
      assert.equal(boundary.body[0].geojson.type, 'Polygon');
      assert.deepEqual(boundary.body[0].geojson.coordinates, [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0],
        ],
      ]);
    });
    const layers = await request(
      'rpc/get_project_vector_layers_geojson',
      'service',
      'POST',
      { p_project_id: projects[1] },
    );
    check('trusted server current-row GeoJSON works', () => {
      assert.equal(layers.status, 200);
      assert.equal(layers.body.length, 1);
      assert.equal(layers.body[0].geojson.geometry.type, 'Point');
    });
    const update = await request(
      `spatial_projects?id=eq.${projects[0]}`,
      'service',
      'PATCH',
      { title: 'DEMO service write' },
      { sub: users.admin },
    );
    check('trusted server mutation retained', () =>
      assert.equal(update.status, 200),
    );
    check('audit records modern JWT subject', () =>
      assert.equal(
        sql(
          `SELECT user_id FROM public.audit_logs WHERE table_name='spatial_projects' AND action_type='UPDATE' ORDER BY created_at DESC LIMIT 1;`,
        ).stdout.trim(),
        users.admin,
      ),
    );
    await request(
      `b2b_entitlements?client_user_id=eq.${users.clientA}`,
      'service',
      'DELETE',
    );
    const revoked = await request('spatial_projects?select=id', 'clientA');
    check('entitlement revocation immediately removes restricted rows', () =>
      assert.deepEqual(revoked.body, [{ id: projects[0] }]),
    );
    const revokedHistory = await request(
      'download_history?select=id',
      'clientA',
    );
    check('revoked download metadata inaccessible', () =>
      assert.deepEqual(revokedHistory.body, []),
    );
    // 008 is safe to rerun; historical scripts intentionally are not.
    sql(file('supabase_migrations/008_staging_security.sql'));
    checks.push('008 reapplies without destructive resets');
    check('browser cannot create public shadow function', () =>
      assert.notEqual(
        sql(
          'BEGIN; SET LOCAL ROLE authenticated; CREATE FUNCTION public.attack() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$; ROLLBACK;',
          true,
        ).status,
        0,
      ),
    );
    check('unsafe default function execution removed', () => {
      sql(
        'CREATE FUNCTION public.phase08_default_test() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;',
      );
      assert.equal(
        sql(
          "SELECT has_function_privilege('anon','public.phase08_default_test()','EXECUTE');",
        ).stdout.trim(),
        'f',
      );
      sql('DROP FUNCTION public.phase08_default_test();');
    });
    writeFileSync(
      resolve(output, `inventory-cycle-${cycle}.txt`),
      sql(file('scripts/database/inventory.sql')).stdout,
    );
    summary.cycles.push({
      cycle,
      version,
      checksPassed: checks.length,
      checks,
    });
    console.log(
      `Cycle ${cycle}: ${checks.length} migration/security checks passed`,
    );
  } finally {
    docker(['rm', '-f', '-v', api, db], { allowFailure: true });
    docker(['network', 'rm', network], { allowFailure: true });
  }
}
writeFileSync(
  resolve(output, 'summary.json'),
  JSON.stringify(summary, null, 2) + '\n',
);
console.log(
  `Verified ${summary.cycles.length} fresh synthetic replays. External schema reproduction remains blocked pending verified foundation DDL.`,
);
