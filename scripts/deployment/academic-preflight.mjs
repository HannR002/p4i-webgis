// Validation only: never deploys, calls a provider or prints environment values.
const [major, minor, patch] = process.versions.node.split('.').map(Number);
if (major !== 22 || minor < 23 || (minor === 23 && patch < 3)) {
  console.error('Academic preview requires Node >=22.23.3 <23.');
  process.exit(1);
}
const { academicStatus } = await import('../../lib/academicPreview.ts');
if (academicStatus(process.env) !== 'active') {
  console.error('Academic preview configuration rejected. Review deployment identity, target and disabled-provider policy.');
  process.exit(1);
}
console.log('Academic preview configuration valid; synthetic guest-only adapter. Release approval remains separate.');
