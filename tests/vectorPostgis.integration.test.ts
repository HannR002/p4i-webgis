import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
vi.mock('server-only', () => ({}));
import { getLocalVectorRepository } from '../lib/server/database/vector/local';
import {
  DEFAULT_SKETCH_STYLE,
  type SketchLayer,
} from '../lib/gis/vectorEditing';
import type {
  SaveVectorLayer,
  VectorLayerDocument,
} from '../lib/gis/vectorPersistence';
const enabled = !!process.env.P4I_VECTOR_TEST_STATE;
const suite = enabled ? describe : describe.skip;
suite(
  'real isolated PostGIS vector persistence (opt-in local fixture only)',
  () => {
    let state: {
      endpoint: string;
      db: string;
      users: Record<string, string>;
      projects: Record<string, string>;
      tokens: Record<string, string>;
    };
    let saved: VectorLayerDocument;
    const square = [
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
        [0, 0],
      ],
      hole = [
        [1, 1],
        [1, 2],
        [2, 2],
        [2, 1],
        [1, 1],
      ];
    const layer = (): SketchLayer => ({
      id: 'local-vector-1',
      name: 'Roundtrip',
      visible: true,
      opacity: 1,
      style: { ...DEFAULT_SKETCH_STYLE, dash: 'dash', strokeOpacity: 0.7 },
      data: {
        type: 'FeatureCollection',
        features: [
          { type: 'Point', coordinates: [103.1234567890123, -1.1234567890123] },
          {
            type: 'LineString',
            coordinates: [
              [0, 0],
              [1, 1],
              [2, 1],
            ],
          },
          { type: 'Polygon', coordinates: [square, hole] },
          {
            type: 'MultiLineString',
            coordinates: [
              [
                [5, 5],
                [6, 6],
              ],
              [
                [7, 7],
                [8, 8],
              ],
            ],
          },
          {
            type: 'MultiPolygon',
            coordinates: [
              [
                [
                  [10, 10],
                  [12, 10],
                  [12, 12],
                  [10, 10],
                ],
              ],
              [
                [
                  [13, 13],
                  [14, 13],
                  [14, 14],
                  [13, 13],
                ],
              ],
            ],
          },
        ].map((geometry, i) => ({
          type: 'Feature' as const,
          id: `local-feature-${i + 1}`,
          geometry:
            geometry as SketchLayer['data']['features'][number]['geometry'],
          properties: {
            name: `Feature ${i + 1}`,
            description: 'Synthetic public test only',
            attributes: {
              sample: i,
              public: true,
              note: '<script>not executable</script>',
            },
          },
        })),
      },
    });
    const repo = (who = 'analyst') =>
      getLocalVectorRepository(who === 'guest' ? null : state.tokens[who]);
    const input = (
      doc = layer(),
      base: VectorLayerDocument | null = null,
    ): SaveVectorLayer => ({
      projectId: state.projects.A,
      layerId: base?.id ?? null,
      expectedRevision: base?.revision ?? 0,
      requestId: randomUUID(),
      layer: doc,
      archive: false,
    });
    function sql(input: string, allowFailure = false) {
      const p = spawnSync(
        'docker',
        [
          '--host=unix:///var/run/docker.sock',
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
        { input, encoding: 'utf8' },
      );
      if (!allowFailure && p.status !== 0) throw Error(p.stderr);
      return p;
    }
    async function direct(
      operation: string | null,
      input: unknown,
      who = 'analyst',
    ) {
      const response = await fetch(state.endpoint + '/rpc/p4i_vector_store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(who === 'guest'
            ? {}
            : { Authorization: `Bearer ${state.tokens[who]}` }),
        },
        body: JSON.stringify({ operation, input }),
      });
      return { status: response.status, body: await response.json() };
    }
    beforeAll(() => {
      state = JSON.parse(
        readFileSync(process.env.P4I_VECTOR_TEST_STATE!, 'utf8'),
      );
      expect(state.db).toMatch(/^p4i-vector15-[a-f0-9]+-db$/);
      expect(new URL(state.endpoint).hostname).toBe('127.0.0.1');
      process.env.VECTOR_STORAGE_MODE = 'local-postgis';
      process.env.VECTOR_STORAGE_LOCAL_ACK = 'synthetic-only';
      process.env.VECTOR_STORAGE_LOCAL_URL = state.endpoint;
    });
    it('lists authorized existing projects, ignores JWT metadata role escalation and separates editing rights', async () => {
      expect((await repo('guest').listProjects()).map((p) => p.id)).toEqual([
        state.projects.public,
      ]);
      const a = await repo('clientA').listProjects();
      expect(a.map((p) => p.id).sort()).toEqual(
        [state.projects.public, state.projects.A].sort(),
      );
      expect(a.every((p) => !p.canEdit)).toBe(true);
      expect(
        (await repo('analyst').listProjects()).find(
          (p) => p.id === state.projects.A,
        )?.canEdit,
      ).toBe(true);
      await expect(repo('clientA').saveLayer(input())).rejects.toMatchObject({
        status: 403,
      });
      await expect(repo('editorB').saveLayer(input())).rejects.toMatchObject({
        status: 403,
      });
    });
    it('creates all five geometry types with holes and multipart, trusted IDs, revisions and GeoJSON roundtrip', async () => {
      saved = await repo().saveLayer(input());
      expect(saved.revision).toBe(1);
      expect(saved.features).toHaveLength(5);
      expect(saved.features.every((f) => f.id !== f.localId)).toBe(true);
      const read = await repo().readLayer(saved.projectId, saved.id);
      expect(read.layer).toEqual(layer());
      expect(read.features).toEqual(saved.features);
      expect(
        sql(
          `SELECT bool_and(ST_SRID(geom)=4326 AND ST_NDims(geom)=2 AND ST_IsValid(geom)) FROM p4i_vector.features WHERE layer_id='${saved.id}';`,
        ).stdout.trim(),
      ).toBe('t');
    });
    it('retries exact duplicate request without duplicate layers or revisions; changed retry body conflicts', async () => {
      const request = input(saved.layer, saved);
      const first = await repo().saveLayer(request);
      const second = await repo().saveLayer(request);
      expect(second).toEqual(first);
      saved = first;
      await expect(
        repo().saveLayer({
          ...request,
          layer: { ...request.layer, name: 'Changed retry' },
        }),
      ).rejects.toMatchObject({ status: 409 });
      expect(
        sql(
          `SELECT count(*) FROM p4i_vector.layer_revisions WHERE layer_id='${saved.id}';`,
        ).stdout.trim(),
      ).toBe('2');
    });
    it('concurrent writers: exactly one wins, stale revision cannot overwrite it', async () => {
      const base = saved;
      const results = await Promise.allSettled([
        repo().saveLayer(input({ ...base.layer, name: 'Writer A' }, base)),
        repo().saveLayer(input({ ...base.layer, name: 'Writer B' }, base)),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
      saved = await repo().readLayer(base.projectId, base.id);
      expect(saved.revision).toBe(base.revision + 1);
    });
    it('updates geometry/attributes with independent feature revision, preserving other feature identities', async () => {
      const l = structuredClone(saved.layer);
      l.data.features[0].geometry = {
        type: 'Point',
        coordinates: [103.5, -1.5],
      };
      l.data.features[0].properties.attributes.sample = 42;
      const next = await repo().saveLayer(input(l, saved));
      expect(next.features[0].revision).toBe(saved.features[0].revision + 1);
      expect(next.features[1]).toEqual(saved.features[1]);
      expect(next.features[0].id).toBe(saved.features[0].id);
      saved = next;
    });
    it('multi-feature SQL failure rolls back every write and revision (forced failure after first update)', async () => {
      const before = await repo().readLayer(saved.projectId, saved.id);
      sql(
        `CREATE FUNCTION p4i_vector.test_rollback() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.local_id='local-feature-2' AND NEW.properties->'attributes'->>'sample'='777' THEN RAISE EXCEPTION 'Synthetic injected failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER test_rollback BEFORE UPDATE ON p4i_vector.features FOR EACH ROW EXECUTE FUNCTION p4i_vector.test_rollback();`,
      );
      const l = structuredClone(saved.layer);
      l.data.features[0].properties.name = 'Should roll back';
      l.data.features[1].properties.attributes.sample = 777;
      await expect(repo().saveLayer(input(l, saved))).rejects.toBeInstanceOf(
        Error,
      );
      expect(await repo().readLayer(saved.projectId, saved.id)).toEqual(before);
      // Disable only the owned synthetic test trigger; no DROP/CASCADE.
      sql('ALTER TABLE p4i_vector.features DISABLE TRIGGER test_rollback;');
    });
    it('authoritative PostGIS rejects malformed polygon, dimensions, SRID relabel and unsafe attributes through direct RPC', async () => {
      for (const mutate of [
        (l: SketchLayer) => {
          Object.assign(l.style, { dash: null });
        },

        (l: SketchLayer) => {
          l.data.features[0].geometry = {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [2, 2],
                [2, 0],
                [0, 2],
                [0, 0],
              ],
            ],
          };
        },
        (l: SketchLayer) => {
          l.data.features[0].geometry = {
            type: 'Point',
            coordinates: [0, 0, 1],
          };
        },
        (l: SketchLayer) => {
          Object.assign(l.data.features[0].geometry, {
            crs: { type: 'name', properties: { name: 'EPSG:3857' } },
          });
        },
        (l: SketchLayer) => {
          l.data.features[0].properties.attributes = JSON.parse(
            '{"__proto__":"bad"}',
          );
        },
        (l: SketchLayer) => {
          l.data.features[0].geometry = {
            type: 'Point',
            coordinates: [181, 0],
          };
        },
      ]) {
        const l = layer();
        mutate(l);
        const response = await direct('save', input(l, saved));
        expect(response.status).toBeGreaterThanOrEqual(400);
      }
      expect((await repo().readLayer(saved.projectId, saved.id)).revision).toBe(
        saved.revision,
      );
    });
    it('isolates project IDs for reads and writes; read-only clients and guests cannot mutate', async () => {
      await expect(
        repo('clientB').readLayer(saved.projectId, saved.id),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        repo().readLayer(state.projects.B, saved.id),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        repo('clientA').saveLayer(input(saved.layer, saved)),
      ).rejects.toMatchObject({ status: 403 });
      expect(
        (await repo('clientA').readLayer(saved.projectId, saved.id)).canEdit,
      ).toBe(false);
      await expect(
        repo('guest').saveLayer(input(saved.layer, saved)),
      ).rejects.toMatchObject({ status: 401 });
    });
    it('rejects null or unknown operations before permission dispatch', async () => {
      for (const operation of [null, 'sql', 'SAVE']) {
        const response = await direct(
          operation,
          input(saved.layer, saved),
          'clientA',
        );
        expect(response.status).toBeGreaterThanOrEqual(400);
      }
      expect((await repo().readLayer(saved.projectId, saved.id)).revision).toBe(
        saved.revision,
      );
    });
    it('revocation and disabled identity take effect immediately, including cached retries', async () => {
      sql(
        `INSERT INTO p4i_vector.project_editors VALUES('${state.projects.A}','${state.users.clientA}','editor'); DELETE FROM public.b2b_entitlements WHERE client_user_id='${state.users.clientA}';`,
      );
      await expect(
        repo('clientA').readLayer(saved.projectId, saved.id),
      ).rejects.toMatchObject({ status: 403 });
      sql(
        `DELETE FROM p4i_vector.project_editors WHERE user_id='${state.users.clientA}'; INSERT INTO public.b2b_entitlements VALUES('${state.users.clientA}','${state.projects.A}'); UPDATE public.user_profiles SET is_disabled=true WHERE id='${state.users.analyst}';`,
      );
      await expect(
        repo().saveLayer(input(saved.layer, saved)),
      ).rejects.toMatchObject({ status: 403 });
      await expect(repo().listProjects()).rejects.toMatchObject({
        status: 403,
      });
      sql(
        `UPDATE public.user_profiles SET is_disabled=false WHERE id='${state.users.analyst}';`,
      );
      await expect(repo('disabled').listProjects()).rejects.toMatchObject({
        status: 403,
      });
    });
    it('proposal refuses application without its explicit local fixture gate', () => {
      const proposal = readFileSync(
        new URL(
          '../database/proposals/009_vector_persistence.LOCAL_ONLY.sql',
          import.meta.url,
        ),
        'utf8',
      );
      expect(sql(proposal, true).status).not.toBe(0);
      expect(sql('SELECT count(*) FROM p4i_vector.layers;').status).toBe(0);
    });
    it('direct table/service-role paths are denied and revision evidence is immutable', async () => {
      const response = await fetch(state.endpoint + '/vector_layers?select=*', {
        headers: { Authorization: `Bearer ${state.tokens.clientA}` },
      });
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(
        sql(
          `UPDATE p4i_vector.layer_revisions SET snapshot='{}' WHERE layer_id='${saved.id}';`,
          true,
        ).status,
      ).not.toBe(0);
      expect(
        sql(
          `SELECT has_function_privilege('service_role','public.p4i_vector_store(text,jsonb)','EXECUTE');`,
        ).stdout.trim(),
      ).toBe('f');
    });
    it('survives PostgreSQL process/container restart with actual stored geometries', async () => {
      const p = spawnSync(
        'docker',
        ['--host=unix:///var/run/docker.sock', 'restart', state.db],
        { encoding: 'utf8' },
      );
      expect(p.status).toBe(0);
      let result: VectorLayerDocument | undefined;
      for (let i = 0; i < 40; i++) {
        try {
          result = await repo().readLayer(saved.projectId, saved.id);
          break;
        } catch {}
        await new Promise((r) => setTimeout(r, 250));
      }
      expect(result?.layer).toEqual(saved.layer);
      expect(result?.revision).toBe(saved.revision);
    }, 30000);
    it('deletes a feature with a tombstone and archives layer with new revisions', async () => {
      const l = structuredClone(saved.layer);
      l.data.features.shift();
      saved = await repo().saveLayer(input(l, saved));
      expect(saved.features).toHaveLength(4);
      expect(
        sql(
          `SELECT count(*) FROM p4i_vector.feature_revisions WHERE layer_id='${saved.id}' AND deleted;`,
        ).stdout.trim(),
      ).toBe('1');
      const archived = await repo().saveLayer({
        ...input(saved.layer, saved),
        archive: true,
      });
      expect(archived.archived).toBe(true);
      expect(archived.revision).toBe(saved.revision + 1);
      expect(await repo().listLayers(saved.projectId)).toEqual([]);
      await expect(
        repo().readLayer(saved.projectId, saved.id),
      ).rejects.toMatchObject({ status: 403 });
    });
  },
);
