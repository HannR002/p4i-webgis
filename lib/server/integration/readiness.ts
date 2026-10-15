import 'server-only';

/** Credentials alone are not permission to run a billable commercial operation. */
export const EARTH_ENGINE_READINESS = Object.freeze({
  status: 'EXTERNAL_INTEGRATION_PENDING' as const,
  executable: false as const,
  blockers: [
    'Commercial Earth Engine registration, billing terms and project IAM not verified',
    'P4I soil asset, legend, provenance and commercial data rights not supplied',
    'Durable governed job adapter, approved estimate and provider cancellation not integrated',
  ],
});
export class ExternalIntegrationPendingError extends Error {
  constructor() {
    super(
      'Integrasi Earth Engine belum diotorisasi untuk eksekusi komersial; job adapter dan kontrol biaya belum tersedia.',
    );
    this.name = 'ExternalIntegrationPendingError';
  }
}
export function requireGovernedEarthEngine(): void {
  // No environment toggle or client approval flag can bypass a missing adapter.
  // Replace this only when the trusted job service supplies a scoped execution permit.
  throw new ExternalIntegrationPendingError();
}
