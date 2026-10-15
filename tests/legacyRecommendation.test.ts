import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { POST } from '../app/api/ai-recommendation/route';

function request() {
  return new Request('http://localhost/api/ai-recommendation', {
    method: 'POST',
    body: JSON.stringify({ kemiringan_lereng: 2, jarak_sungai: 100, curah_hujan: 2000, kepadatan_penduduk: 50 }),
  });
}
afterEach(() => vi.unstubAllEnvs());
describe('legacy mock recommendation', () => {
  it('never returns the fixed mock score in production even with the demo flag', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('GIS_DEMO_MODE', 'true');
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty('skor_kelayakan');
  });
  it('labels every explicit development fixture as synthetic', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('GIS_DEMO_MODE', 'true');
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ demo: true, provider: 'deterministic-demo', disclaimer: expect.stringContaining('sintetik') });
  });
});
