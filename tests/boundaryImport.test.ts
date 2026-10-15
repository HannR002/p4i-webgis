import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  parseBoundaryBytes,
  shapefileParts,
} from '../scripts/gis/boundary-input.mjs';
import {
  storedZip,
  syntheticShape,
  featureCollection,
} from './gis/import-fixtures.mjs';
const json = (value: unknown) => Buffer.from(JSON.stringify(value));
describe('bounded local boundary ingestion', () => {
  it('normalizes geographic polygon to MultiPolygon while retaining explicit topology limitation', async () => {
    const result = await parseBoundaryBytes(
      json(featureCollection),
      '.geojson',
      'EPSG:4326',
    );
    expect(result.features[0].geometry.type).toBe('MultiPolygon');
    expect(result.coordinateCount).toBe(5);
    expect(result.validation).toContain('STRUCTURAL_ONLY');
  });
  it('transforms actual projected SHP coordinates via verified PRJ and parses DBF fields', async () => {
    const result = await parseBoundaryBytes(
      storedZip(syntheticShape()),
      '.zip',
      'prj',
    );
    const p = result.features[0].geometry.coordinates[0][0][2];
    expect(p[0]).toBeCloseTo(1, 6);
    expect(p[1]).toBeCloseTo(1, 6);
    expect(result.features[0].properties.code).toBe('0001');
  });
  it('transforms EPSG:3857 GeoJSON and rejects ambiguous/conflicting CRS', async () => {
    const projected = structuredClone(featureCollection);
    projected.features[0].geometry.coordinates = [
      [
        [0, 0],
        [111319.49079327357, 0],
        [111319.49079327357, 111325.1428663851],
        [0, 111325.1428663851],
        [0, 0],
      ],
    ];
    const parsed = await parseBoundaryBytes(
      json(projected),
      '.json',
      'EPSG:3857',
    );
    expect(parsed.features[0].geometry.coordinates[0][0][2][1]).toBeCloseTo(
      1,
      6,
    );
    await expect(
      parseBoundaryBytes(json(projected), '.json', 'EPSG:4326'),
    ).rejects.toThrow();
    await expect(
      parseBoundaryBytes(json(projected), '.json', 'EPSG:9999'),
    ).rejects.toThrow();
    await expect(
      parseBoundaryBytes(
        json({
          ...featureCollection,
          crs: { properties: { name: 'EPSG:3857' } },
        }),
        '.json',
        'EPSG:4326',
      ),
    ).rejects.toThrow(/conflicts/);
  });
  it('rejects missing/invalid PRJ, corrupt ZIP data, excessive expansion and unsafe paths', () => {
    const valid = syntheticShape();
    const missing = { ...valid };
    delete (missing as Partial<typeof valid>)['fixture.prj'];
    expect(() => shapefileParts(storedZip(missing))).toThrow(/prj/);
    expect(() =>
      shapefileParts(
        storedZip({ ...valid, 'fixture.prj': 'NOT-A-PROJECTION' }),
      ),
    ).toThrow();
    const corrupt = storedZip(valid);
    corrupt[45] ^= 1;
    expect(() => shapefileParts(corrupt)).toThrow();
    const oversized = storedZip(valid),
      central = oversized.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    oversized.writeUInt32LE(70 * 1024 * 1024, central + 24);
    expect(() => shapefileParts(oversized)).toThrow(/limit/);
    expect(() =>
      shapefileParts(storedZip({ '../escape.shp': Buffer.alloc(1) })),
    ).toThrow(/Unsafe/);
  });
  it('rejects open/degenerate rings, nonfinite coordinates and excessive feature batches', async () => {
    for (const ring of [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
      [
        [0, 0],
        [1, 1],
        [2, 2],
        [0, 0],
      ],
      [
        [0, 0],
        [null, 0],
        [1, 1],
        [0, 0],
      ],
    ]) {
      const bad = structuredClone(featureCollection);
      bad.features[0].geometry.coordinates = [ring as number[][]];
      await expect(
        parseBoundaryBytes(json(bad), '.json', 'EPSG:4326'),
      ).rejects.toThrow();
    }
    await expect(
      parseBoundaryBytes(
        json({
          type: 'FeatureCollection',
          features: Array(5001).fill(featureCollection.features[0]),
        }),
        '.json',
        'EPSG:4326',
      ),
    ).rejects.toThrow(/5000/);
  });
  it('CLI dry-run writes provenance evidence without credentials or network writes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'p4i-import-'));
    try {
      const input = join(dir, 'fixture.geojson'),
        report = join(dir, 'report.json');
      writeFileSync(input, JSON.stringify(featureCollection));
      const args = [
        'scripts/import-boundaries.mjs',
        `--input=${input}`,
        '--level=provinsi',
        '--source=SYNTHETIC',
        '--source-version=fixture-v1',
        '--code-field=code',
        '--name-field=name',
        '--source-crs=EPSG:4326',
        '--license=DEMO-TEST-ONLY',
        `--report=${report}`,
      ];
      const env = {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: '',
        SUPABASE_SERVICE_ROLE_KEY: '',
      };
      expect(
        execFileSync(process.execPath, args, { env, encoding: 'utf8' }),
      ).toContain('Dry run only');
      const result = JSON.parse(readFileSync(report, 'utf8'));
      expect(result.mode).toBe('LOCAL_DRY_RUN');
      expect(result.provenance.inputSha256).toMatch(/^[a-f0-9]{64}$/);
      const denied = spawnSync(process.execPath, [...args, '--execute'], {
        env,
        encoding: 'utf8',
      });
      expect(denied.status).not.toBe(0);
      expect(denied.stderr).toContain('STAGE_BOUNDARIES');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
