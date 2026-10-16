import 'server-only';

import type { FloodAnalysisProvider } from './integration/floodProvider';
import { ExternalIntegrationPendingError } from './integration/readiness';

/**
 * Compatibility entry point: no SDK, credential parsing or network initialization.
 * A future real provider requires a separate reviewed implementation, not an env flag.
 */
export function initializeEarthEngine(): never {
  throw new ExternalIntegrationPendingError();
}

/** Unavailable even if the route/service readiness guard is accidentally relaxed. */
export const unavailableEarthEngineProvider: FloodAnalysisProvider =
  Object.freeze({
    id: 'earth-engine-unavailable',
    async analyze(): Promise<never> {
      return initializeEarthEngine();
    },
  });
