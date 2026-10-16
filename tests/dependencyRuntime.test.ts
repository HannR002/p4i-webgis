import { afterEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { createRequire } from 'node:module';

vi.mock('server-only', () => ({}));
import { initializeEarthEngine } from '../lib/server/earthEngine';

afterEach(() => vi.restoreAllMocks());

describe('patched dependency runtime compatibility', () => {
  it('decodes and resizes a bounded local PNG with the native sharp runtime', async () => {
    const source = await sharp({
      create: {
        width: 4,
        height: 4,
        channels: 4,
        background: { r: 20, g: 80, b: 120, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    const result = await sharp(source, { limitInputPixels: 16 })
      .resize(2, 2)
      .webp()
      .toBuffer();
    expect(await sharp(result).metadata()).toMatchObject({
      format: 'webp',
      width: 2,
      height: 2,
    });
  });

  it('refuses initialization with no Earth Engine SDK available to authenticate', () => {
    // The former SDK-spy check becomes an absence assertion after isolation.
    const require = createRequire(import.meta.url);
    expect(() => require.resolve('@google/earthengine')).toThrow(
      /Cannot find module/,
    );
    expect(() => initializeEarthEngine()).toThrow(/belum diotorisasi/);
  });
});
