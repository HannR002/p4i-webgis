import type { FreeAiCode } from '../../gis/freeAi';
// Only server-owned fixed messages cross the API boundary; never pass provider response text.
const messages: Record<FreeAiCode, string> = {
  FREE_TIER_UNVERIFIED:
    'Free Tier belum terverifikasi atau izin kedaluwarsa. Tidak ada panggilan eksternal.',
  PRIVATE_CONTEXT_BLOCKED:
    'Konteks privat/tidak masuk allowlist ditolak. Gemini hanya menerima skenario sintetik server.',
  API_KEY_MISSING: 'Kunci Gemini server belum tersedia. Tidak ada fallback.',
  MODEL_UNAVAILABLE:
    'Model Free Tier tidak tersedia; tidak ada perpindahan provider.',
  QUOTA_EXHAUSTED:
    'Kuota Free Tier/aplikasi habis. Tunggu verifikasi operator; tidak ada upgrade otomatis.',
  INVALID_PROVIDER_OUTPUT: 'Rencana Gemini tidak valid; perubahan dibatalkan.',
};
export class SafeProviderError extends Error {
  constructor(readonly code: FreeAiCode) {
    super(messages[code]);
  }
}
