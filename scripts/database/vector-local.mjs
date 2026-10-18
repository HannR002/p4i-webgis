// Disposable local Docker only. Never consumes DATABASE_URL, Supabase, GEE or other external bindings.
import { spawnSync } from 'node:child_process';
import { randomBytes, createHmac } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import assert from 'node:assert/strict';
const statePath =
  process.env.P4I_VECTOR_TEST_STATE ||
  '/workspace/artifacts/phase-15/local-state.json';
const env = { ...process.env };
for (const key of [
  'DOCKER_HOST',
  'DOCKER_CONTEXT',
  'DOCKER_TLS',
  'DOCKER_TLS_VERIFY',
  'DOCKER_CERT_PATH',
])
  delete env[key];
export function docker(args, input, allowFailure = false) {
  const p = spawnSync(
    'docker',
    ['--host=unix:///var/run/docker.sock', ...args],
    {
      env,
      input,
      encoding: 'utf8',
      timeout: 60000,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  if (p.status !== 0 && !allowFailure)
    throw Error(
      `Local Docker ${args[0]} failed: ${(p.stderr || '').slice(0, 1200)}`,
    );
  return p;
}
const file = (path) =>
  readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
export function sql(state, input, fail = false) {
  return docker(
    [
      'exec',
      '-i',
      state.db,
      'psql',
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'postgres',
      '-d',
      'p4i_phase15_local',
      '-At',
    ],
    input,
    fail,
  );
}
if (process.argv[2] === 'stop') {
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  assert(/^p4i-vector15-[a-f0-9]+$/.test(state.network));
  assert.equal(state.db, state.network + '-db');
  assert.equal(state.api, state.network + '-api');
  docker(['rm', '-f', '-v', state.api, state.db], undefined, true);
  docker(['network', 'rm', state.network], undefined, true);
  unlinkSync(statePath);
  console.log('Removed this Phase 15 local fixture only');
} else if (process.argv[2] === 'start') {
  assert(
    !existsSync(statePath),
    'State file exists; stop its owned fixture first',
  );
  const network = 'p4i-vector15-' + randomBytes(6).toString('hex'),
    db = network + '-db',
    api = network + '-api';
  const state = { network, db, api };
  try {
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
      '-e',
      'POSTGRES_DB=p4i_phase15_local',
      '-e',
      'POSTGRES_HOST_AUTH_METHOD=trust',
      'postgis/postgis:16-3.5@sha256:94146ac37bc61e2322f88016056c5920729cb8c64c8542ed590af8fc2abdac07',
    ]);
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
            'p4i_phase15_local',
          ],
          undefined,
          true,
        ).status === 0
      ) {
        ready = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    assert(ready);
    sql(state, file('tests/database/synthetic-foundation.sql'));
    // Fixture setup only: supply minimal dependencies, revoke the intentionally unsafe historical fixture grants.
    sql(
      state,
      `ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created;
 ALTER TABLE public.user_profiles ADD COLUMN is_disabled boolean NOT NULL DEFAULT false;
 CREATE TABLE public.b2b_entitlements(client_user_id uuid REFERENCES public.user_profiles(id),project_id uuid REFERENCES public.spatial_projects(id),PRIMARY KEY(client_user_id,project_id));
 REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC,anon,authenticated,service_role;
 REVOKE CREATE ON SCHEMA public FROM PUBLIC,anon,authenticated,service_role;`,
    );
    sql(
      state,
      "SET p4i.local_fixture='synthetic-only';\n" +
        file('database/proposals/009_vector_persistence.LOCAL_ONLY.sql'),
    );
    const users = Object.fromEntries(
      ['clientA', 'clientB', 'analyst', 'admin', 'disabled', 'editorB'].map(
        (n, i) => [n, `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${i + 1}`],
      ),
    );
    const projects = Object.fromEntries(
      ['public', 'A', 'B'].map((n, i) => [
        n,
        `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb${i + 1}`,
      ]),
    );
    for (const [name, id] of Object.entries(users))
      sql(
        state,
        `INSERT INTO auth.users(id) VALUES('${id}'); INSERT INTO public.user_profiles(id,email,role,is_disabled) VALUES('${id}','${name}@example.invalid','${['admin'].includes(name) ? 'super_admin' : ['analyst', 'editorB'].includes(name) ? 'managerial_analyst' : 'b2b_client'}',${name === 'disabled'});`,
      );
    for (const [name, id] of Object.entries(projects))
      sql(
        state,
        `INSERT INTO public.spatial_projects(id,title,access_tier) VALUES('${id}','DEMO Project ${name}','${name === 'public' ? 'public' : 'restricted'}');`,
      );
    sql(
      state,
      `INSERT INTO p4i_vector.project_editors VALUES('${projects.A}','${users.analyst}','owner'),('${projects.public}','${users.analyst}','editor'),('${projects.B}','${users.editorB}','owner'); INSERT INTO public.b2b_entitlements VALUES('${users.clientA}','${projects.A}'),('${users.clientB}','${projects.B}');`,
    );
    const secret = randomBytes(48).toString('hex');
    // Secret passed via inherited environment, never argv or logs.
    const saved = env.PGRST_JWT_SECRET;
    env.PGRST_JWT_SECRET = secret;
    docker([
      'create',
      '--name',
      api,
      '--network',
      'bridge',
      '-p',
      '127.0.0.1::3000',
      '-e',
      'PGRST_DB_URI=postgres://authenticator@database:5432/p4i_phase15_local',
      '-e',
      'PGRST_DB_SCHEMAS=public',
      '-e',
      'PGRST_DB_ANON_ROLE=anon',
      '-e',
      'PGRST_JWT_SECRET',
      '-e',
      'PGRST_DB_MAX_ROWS=100',
      'postgrest/postgrest:v12.2.12@sha256:5f4ce744539bbba786b4e24dbbd95bdb2a956dcf568c5374995a0ff4a68f5bd2',
    ]);
    if (saved === undefined) delete env.PGRST_JWT_SECRET;
    else env.PGRST_JWT_SECRET = saved;
    docker(['network', 'connect', network, api]);
    docker(['start', api]);
    const port = docker(['port', api, '3000/tcp'])
      .stdout.trim()
      .split(':')
      .at(-1);
    const encode = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
    const token = (sub) => {
      const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 86400, user_metadata: { role: 'super_admin' } })}`;
      return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
    };
    Object.assign(state, {
      endpoint: `http://127.0.0.1:${port}`,
      users,
      projects,
      tokens: Object.fromEntries(
        Object.entries(users).map(([n, id]) => [n, token(id)]),
      ),
    });
    for (let i = 0; i < 40; i++) {
      try {
        const r = await fetch(state.endpoint);
        if (r.ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 250));
    }
    writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 });
    console.log(
      'Disposable PostGIS/PostgREST fixture ready; synthetic credentials saved outside the repository.',
    );
  } catch (e) {
    docker(['rm', '-f', '-v', api, db], undefined, true);
    docker(['network', 'rm', network], undefined, true);
    throw e;
  }
}
