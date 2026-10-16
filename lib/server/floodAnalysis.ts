import 'server-only';
import type { FloodAnalysisInput } from '../../config/floodRiskModel';
import type { FloodAnalysisResult } from '../../types/flood';
import { unavailableEarthEngineProvider } from './earthEngine';
import { requireGovernedEarthEngine } from './integration/readiness';

// Kept for the legacy route's timeout/error contract and future reviewed adapters.
export class FloodAnalysisServiceError extends Error {
  constructor(
    message: string,
    readonly status: 404 | 503 = 503,
  ) {
    super(message);
    this.name = 'FloodAnalysisServiceError';
  }
}

/**
 * Preserves the existing API while real analysis is unavailable. The historical
 * graph/cache implementation is archived in docs/reference/earth-engine-phase11.md.
 * No database, cache, credentials or synthetic result is used on this path.
 */
export async function analyzeFloodRisk(
  input: FloodAnalysisInput,
  computedBy: string,
): Promise<FloodAnalysisResult> {
  requireGovernedEarthEngine();
  return unavailableEarthEngineProvider.analyze(input, computedBy);
}
