import type { FloodAnalysisInput } from '../../../config/floodRiskModel';
import type { FloodAnalysisResult } from '../../../types/flood';

/**
 * Provider-neutral boundary using the existing legacy flood request/result DTOs.
 * computedBy is trusted server identity, not an authorization or cost-approval token.
 * A real adapter must add governed execution permits before it can be selected.
 */
export interface FloodAnalysisProvider {
  readonly id: string;
  analyze(
    input: FloodAnalysisInput,
    computedBy: string,
  ): Promise<FloodAnalysisResult>;
}
