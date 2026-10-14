import { foundationStatus, migrationPlan } from './migration-plan.mjs';
console.log(
  JSON.stringify(
    { foundation: foundationStatus, migrations: migrationPlan() },
    null,
    2,
  ),
);
if (process.argv.includes('--require-verified-foundation'))
  process.exitCode = foundationStatus.verified ? 0 : 2;
