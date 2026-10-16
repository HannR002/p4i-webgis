import { afterEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import earthEngine from '@google/earthengine';

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

  it('refuses initialization before invoking the actual installed Earth Engine SDK', () => {
    // These spies fail immediately if the application guard ever reaches the SDK.
    // No credentials are read and no authentication/initialization is executed.
    const authenticate = vi
      .spyOn(earthEngine.data, 'authenticateViaPrivateKey')
      .mockImplementation(() => {
        throw new Error('Unexpected SDK authentication');
      });
    const initialize = vi
      .spyOn(earthEngine, 'initialize')
      .mockImplementation(() => {
        throw new Error('Unexpected SDK initialization');
      });
    expect(() => initializeEarthEngine()).toThrow(/belum diotorisasi/);
    expect(authenticate).not.toHaveBeenCalled();
    expect(initialize).not.toHaveBeenCalled();
  });
});
