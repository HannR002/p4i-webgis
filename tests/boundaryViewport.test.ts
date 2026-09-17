import { describe, expect, it } from 'vitest';
import { parseBoundaryViewport } from '../lib/server/boundaryViewport';

describe('boundary viewport access', () => {
  it('accepts a bounded, simplified public viewport request', () => {
    const params = new URLSearchParams({
      west: '106', south: '-7', east: '108', north: '-5', level: 'kecamatan', tolerance: '0.001',
    });
    expect(parseBoundaryViewport(params)).toEqual({
      west: 106,
      south: -7,
      east: 108,
      north: -5,
      level: 'kecamatan',
      tolerance: 0.001,
    });
  });

  it.each([
    { west: '108', south: '-7', east: '106', north: '-5', level: 'kecamatan', tolerance: '0.001' },
    { west: '106', south: '-7', east: '108', north: '-5', level: 'desa', tolerance: '0.001' },
    { west: '106', south: '-7', east: '108', north: '-5', level: 'kecamatan', tolerance: '0.5' },
  ])('rejects an unsafe viewport %#', (input) => {
    expect(parseBoundaryViewport(new URLSearchParams(input))).toBeNull();
  });
});
