// Public UI constants are not authorization. The server separately checks the complete context.
export const GEMINI_FREE_MODEL = 'gemini-2.5-flash-lite';
export const GEMINI_FREE_PROVIDER = {
  id: 'gemini-free',
  mode: 'real' as const,
};
export const SYNTHETIC_GEMINI_PROMPT =
  'Buat peta sintetik bernama Latihan Publik dengan OpenStreetMap. Buat layer vektor Latihan dan titik A [0, 0], B [0.01, 0], C [0.01, 0.01]. Buat poligon dari A, B, C. Ini data sintetik untuk pengujian, bukan lokasi survei.';
export type FreeAiCode =
  | 'FREE_TIER_UNVERIFIED'
  | 'PRIVATE_CONTEXT_BLOCKED'
  | 'API_KEY_MISSING'
  | 'MODEL_UNAVAILABLE'
  | 'QUOTA_EXHAUSTED'
  | 'INVALID_PROVIDER_OUTPUT';
export interface FreeAiStatus {
  provider: 'demo' | 'gemini-free' | 'unavailable';
  liveStatus: 'LIVE_INTEGRATION_PENDING';
  externalEnabled: boolean;
  reason: string;
}
