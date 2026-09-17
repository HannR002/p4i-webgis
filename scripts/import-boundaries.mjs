#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import shp from 'shpjs';

const ALLOWED_LEVELS = new Set(['provinsi', 'kota', 'kecamatan']);
const REQUIRED_CONFIRMATION = 'STAGE_BOUNDARIES';

function parseArgs(argv) {
  const result = {};
  for (const argument of argv) {
    if (argument === '--execute') result.execute = true;
    else if (argument.startsWith('--') && argument.includes('=')) {
      const [key, ...value] = argument.slice(2).split('=');
      result[key] = value.join('=');
    }
  }
  return result;
}

function requiredString(args, key) {
  const value = args[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`--${key}=... is required`);
  return value.trim();
}

function readField(properties, fieldName, required) {
  const value = properties?.[fieldName];
  if (value === undefined || value === null || String(value).trim() === '') {
    if (required) throw new Error(`Missing required field: ${fieldName}`);
    return null;
  }
  return String(value).trim();
}

function toMultiPolygon(geometry) {
  if (!geometry || !Array.isArray(geometry.coordinates)) {
    throw new Error('Feature has invalid geometry');
  }
  if (geometry.type === 'Polygon') {
    return { type: 'MultiPolygon', coordinates: [geometry.coordinates] };
  }
  if (geometry.type === 'MultiPolygon') {
    return { type: 'MultiPolygon', coordinates: geometry.coordinates };
  }
  throw new Error(`Only Polygon/MultiPolygon are supported, got ${geometry.type ?? 'unknown'}`);
}

async function readFeatureCollection(inputPath) {
  const extension = extname(inputPath).toLowerCase();
  const bytes = await readFile(inputPath);
  if (extension === '.zip') return shp(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  if (extension === '.json' || extension === '.geojson') return JSON.parse(bytes.toString('utf8'));
  throw new Error('Input must be GeoJSON or a zipped Shapefile including its .prj file');
}

function flattenFeatures(parsed) {
  const collections = Array.isArray(parsed) ? parsed : [parsed];
  const features = collections.flatMap((collection) => {
    if (collection?.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
      throw new Error('Input is not a valid FeatureCollection');
    }
    return collection.features;
  });
  if (!features.length) throw new Error('Input contains no features');
  return features;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = resolve(requiredString(args, 'input'));
  const level = requiredString(args, 'level');
  const source = requiredString(args, 'source');
  const sourceVersion = requiredString(args, 'source-version');
  const codeField = requiredString(args, 'code-field');
  const nameField = requiredString(args, 'name-field');
  const parentCodeField = typeof args['parent-code-field'] === 'string'
    ? args['parent-code-field'].trim()
    : null;

  if (!ALLOWED_LEVELS.has(level)) throw new Error('--level must be provinsi, kota, or kecamatan');
  if (level !== 'provinsi' && !parentCodeField) {
    throw new Error('--parent-code-field is required for kota and kecamatan');
  }

  const features = flattenFeatures(await readFeatureCollection(input));
  const batchId = randomUUID();
  const rows = features.map((feature) => ({
    batch_id: batchId,
    kode_wilayah: readField(feature.properties, codeField, true),
    parent_kode_wilayah: parentCodeField
      ? readField(feature.properties, parentCodeField, level !== 'provinsi')
      : null,
    level,
    nama: readField(feature.properties, nameField, true),
    source,
    source_version: sourceVersion,
    geometry: toMultiPolygon(feature.geometry),
    raw_properties: feature.properties ?? {},
  }));

  const uniqueCodes = new Set(rows.map((row) => row.kode_wilayah));
  if (uniqueCodes.size !== rows.length) throw new Error('Duplicate kode_wilayah values found in input');

  console.log(`Validated ${rows.length} ${level} boundaries from ${input}`);
  console.log(`Staging batch: ${batchId}`);
  if (!args.execute) {
    console.log('Dry run only. Add --execute --confirm=STAGE_BOUNDARIES to write to staging.');
    return;
  }
  if (args.confirm !== REQUIRED_CONFIRMATION) {
    throw new Error(`Execution requires --confirm=${REQUIRED_CONFIRMATION}`);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  for (let index = 0; index < rows.length; index += 200) {
    const { error } = await client
      .from('administrative_boundaries_import_staging')
      .insert(rows.slice(index, index + 200));
    if (error) throw error;
    console.log(`Staged ${Math.min(index + 200, rows.length)}/${rows.length}`);
  }

  console.log('Staging complete. Review the batch before promotion.');
  console.log(`Promotion RPC argument: { "p_batch_id": "${batchId}" }`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Boundary import failed');
  process.exitCode = 1;
});

