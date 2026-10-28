// Reviewed opt-in coverage. Update counts only alongside reviewed test changes.
export const DATABASE_COVERAGE = Object.freeze({
  'tests/vectorPostgis.integration.test.ts': 14,
  'tests/vectorAnalysis.integration.test.ts': 23,
});
export const DATABASE_SUITES = Object.freeze(Object.keys(DATABASE_COVERAGE));
export const DATABASE_ASSERTIONS = Object.values(DATABASE_COVERAGE).reduce((a, b) => a + b, 0);
