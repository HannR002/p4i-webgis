#!/usr/bin/env node

import { readFile, stat, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { IMPORT_LIMITS, parseBoundaryBytes } from './gis/boundary-input.mjs';

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
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`--${key}=... is required`);
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = resolve(requiredString(args, 'input'));
  const level = requiredString(args, 'level');
  const source = requiredString(args, 'source');
  const sourceVersion = requiredString(args, 'source-version');
  const codeField = requiredString(args, 'code-field');
  const nameField = requiredString(args, 'name-field');
  const parentCodeField =
    typeof args['parent-code-field'] === 'string'
      ? args['parent-code-field'].trim()
      : null;

  if (!ALLOWED_LEVELS.has(level))
    throw new Error('--level must be provinsi, kota, or kecamatan');
  if (level !== 'provinsi' && !parentCodeField) {
    throw new Error('--parent-code-field is required for kota and kecamatan');
  }

  const sourceCrs = requiredString(args, 'source-crs');
  const license = requiredString(args, 'license');
  if (source.length > 100 || sourceVersion.length > 100 || license.length > 500)
    throw new Error('Source/version/license metadata exceeds limits');
  if ((await stat(input)).size > IMPORT_LIMITS.bytes)
    throw new Error('Input exceeds 32 MiB; split offline');
  const bytes = await readFile(input);
  const parsed = await parseBoundaryBytes(
    bytes,
    extname(input).toLowerCase(),
    sourceCrs,
  );
  const { features } = parsed;
  const provenance = {
    source,
    sourceVersion,
    license,
    sourceCrs,
    targetCrs: parsed.targetCrs,
    inputSha256: createHash('sha256').update(bytes).digest('hex'),
  };
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
    geometry: feature.geometry,
    raw_properties: {
      ...feature.properties,
      p4i_import_provenance: provenance,
    },
  }));

  if (
    rows.some(
      (row) =>
        row.kode_wilayah.length > 32 ||
        row.nama.length > 255 ||
        (row.parent_kode_wilayah?.length ?? 0) > 32,
    )
  )
    throw new Error('Boundary names/codes exceed database limits');
  const uniqueCodes = new Set(rows.map((row) => row.kode_wilayah));
  if (uniqueCodes.size !== rows.length)
    throw new Error('Duplicate kode_wilayah values found in input');

  const report = {
    mode: args.execute ? 'STAGING_REQUESTED' : 'LOCAL_DRY_RUN',
    batchId,
    count: rows.length,
    coordinateCount: parsed.coordinateCount,
    validation: parsed.validation,
    provenance,
  };
  if (args.report)
    await writeFile(
      resolve(args.report),
      JSON.stringify(report, null, 2) + '\n',
    );
  console.log(
    `Structurally checked ${rows.length} ${level} boundaries; PostGIS topology review still required`,
  );
  console.log(`Staging batch: ${batchId}`);
  if (!args.execute) {
    console.log(
      'Dry run only. External staging requires prior authorization plus --execute --confirm=STAGE_BOUNDARIES --environment=staging --target-host=<hostname>.',
    );
    return;
  }
  if (args.confirm !== REQUIRED_CONFIRMATION) {
    throw new Error(`Execution requires --confirm=${REQUIRED_CONFIRMATION}`);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required',
    );
  }
  const target = new URL(supabaseUrl);
  if (
    args.environment !== 'staging' ||
    args['target-host'] !== target.hostname ||
    target.protocol !== 'https:'
  )
    throw new Error(
      'Explicit --environment=staging and --target-host=<configured hostname> required',
    );
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  for (let index = 0; index < rows.length; index += 200) {
    const { error } = await client
      .from('administrative_boundaries_import_staging')
      .insert(rows.slice(index, index + 200));
    if (error)
      throw new Error(
        `Staging batch failed at offset ${index}; partial batch ${batchId} requires review`,
      );
    console.log(`Staged ${Math.min(index + 200, rows.length)}/${rows.length}`);
  }

  console.log('Staging complete. Review the batch before promotion.');
  console.log(`Promotion RPC argument: { "p_batch_id": "${batchId}" }`);
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Boundary import failed',
  );
  process.exitCode = 1;
});
