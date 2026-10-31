// Validation only. No provider calls, deployment, credential values or exception approval.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const { academicStatus, academicProvider } = await import('../../lib/academicPreview.ts');
if (academicProvider(process.env) !== 'hostinger' || academicStatus(process.env) !== 'active') {
  console.error('Hostinger academic preview rejected: requires Node >=22.23.3 <23, explicit identity/hostname, access protection and disabled backend policy.');
  process.exit(1);
}
// Git imports can verify the declared revision directly. ZIP delivery requires owner digest/provenance verification.
if (existsSync('.git')) {
  const git = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  if (git.status !== 0 || git.stdout.trim() !== process.env.P4I_SOURCE_REVISION) {
    console.error('Hostinger source revision does not match the selected checkout.');
    process.exit(1);
  }
}
console.log('Hostinger academic configuration valid; synthetic guest-only preview. Release and audit-risk approval remain separate.');
