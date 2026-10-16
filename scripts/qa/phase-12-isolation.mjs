import assert from 'node:assert/strict';
import {
  readFile,
  readdir,
  realpath,
  mkdir,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    root: { type: 'string', default: process.cwd() },
    'install-only': { type: 'boolean', default: false },
  },
});
const root = path.resolve(values.root);
const forbidden = [
  '@google/earthengine',
  'googleapis',
  'googleapis-common',
  'google-auth-library',
  'gtoken',
  'google-p12-pem',
  'node-forge',
  'uuid',
];
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const manifest = await readJson(path.join(root, 'package.json'));
const lock = await readJson(path.join(root, 'package-lock.json'));
for (const group of [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
]) {
  for (const name of forbidden)
    assert(!manifest[group]?.[name], `Manifest reintroduced ${name}`);
  assert.deepEqual(
    manifest[group],
    lock.packages[''][group],
    `${group} lock mismatch`,
  );
}
for (const [location, entry] of Object.entries(lock.packages)) {
  const name = entry.name || location.split('node_modules/').at(-1);
  assert(!forbidden.includes(name), `Locked vulnerable chain: ${location}`);
}
const installed = [],
  visited = new Set();
async function inspectPackage(dir) {
  const canonical = await realpath(dir);
  if (visited.has(canonical)) return;
  visited.add(canonical);
  let pkg;
  try {
    pkg = await readJson(path.join(dir, 'package.json'));
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  assert(
    !forbidden.includes(pkg.name),
    `Installed vulnerable chain: ${pkg.name}`,
  );
  installed.push({ name: pkg.name, version: pkg.version });
  await inspectModules(path.join(dir, 'node_modules'));
}
async function inspectModules(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  for (const entry of entries) {
    if (
      entry.name.startsWith('.') ||
      (!entry.isDirectory() && !entry.isSymbolicLink())
    )
      continue;
    const child = path.join(dir, entry.name);
    if (entry.name.startsWith('@')) {
      for (const scope of await readdir(child))
        await inspectPackage(path.join(child, scope));
    } else await inspectPackage(child);
  }
}
await inspectModules(path.join(root, 'node_modules'));
assert(installed.length > 0, 'No installation found to inspect');
const bundle = {
  inspected: false,
  files: 0,
  traces: 0,
  tracedFiles: 0,
  matches: [],
};
if (!values['install-only']) {
  // Require a completed build; do not treat absent output as successful isolation.
  assert((await readFile(path.join(root, '.next/BUILD_ID'), 'utf8')).trim());
  const markers = [
    '@google/earthengine',
    'google-auth-library',
    'googleapis-common',
    'google-p12-pem',
    'node-forge',
    'authenticateViaPrivateKey',
  ];
  const deniedTracePackages = [
    ...forbidden,
    'braces',
    'micromatch',
    'fast-glob',
  ];
  async function inspectOutput(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await inspectOutput(file);
        continue;
      }
      if (!/\.(?:js|mjs|json|map)$/.test(entry.name)) continue;
      const content = await readFile(file, 'utf8');
      bundle.files++;
      for (const marker of markers) {
        if (content.includes(marker))
          bundle.matches.push({ file: path.relative(root, file), marker });
      }
      if (entry.name.endsWith('.nft.json')) {
        bundle.traces++;
        for (const traced of JSON.parse(content).files) {
          bundle.tracedFiles++;
          const normalized = traced.replaceAll('\\', '/');
          assert(
            !normalized.includes('docs/reference/earth-engine-phase11.md'),
            'Reference source entered output trace',
          );
          for (const name of deniedTracePackages) {
            assert(
              !normalized.includes(`/node_modules/${name}/`),
              `Unexpected deployable dependency: ${name}`,
            );
          }
        }
      }
    }
  }
  await inspectOutput(path.join(root, '.next/server'));
  await inspectOutput(path.join(root, '.next/static'));
  assert(bundle.traces > 0, 'No Next.js dependency traces found');
  assert.deepEqual(
    bundle.matches,
    [],
    'SDK code/markers found in server/client output',
  );
  bundle.inspected = true;
}
const output = path.resolve(
  process.env.P4I_QA_ARTIFACTS || '/tmp/p4i-phase12-isolation',
);
await mkdir(output, { recursive: true });
await writeFile(
  path.join(output, 'isolation.json'),
  JSON.stringify(
    {
      mode: values['install-only'] ? 'INSTALL_ONLY' : 'INSTALL_AND_NEXT_BUILD',
      root,
      forbidden,
      lockedPackages: Object.keys(lock.packages).length,
      installedPackages: installed.length,
      forbiddenInstalledPackages: [],
      bundle,
      scope:
        'Application manifest, complete lockfile, recursive local node_modules and optionally fresh Next server/static output; host-global tooling is outside the deployable graph',
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `PASS: ${installed.length} installed packages; ${bundle.files} output files; ${bundle.traces} dependency traces; no GEE chain`,
);
