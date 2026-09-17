import { beforeEach, describe, expect, it } from 'vitest';
import { useMapStore } from '../store/useMapStore';

describe('administrative boundary selection', () => {
  beforeEach(() => {
    useMapStore.getState().setActiveBoundary(null);
  });

  it('stores only boundary identity and clears a previous flood result', () => {
    useMapStore.getState().setActiveBoundary({
      id: '123e4567-e89b-42d3-a456-426614174000',
      name: 'Kecamatan Contoh',
      level: 'kecamatan',
    });

    const state = useMapStore.getState();
    expect(state.activeBoundaryId).toBe('123e4567-e89b-42d3-a456-426614174000');
    expect(state.activeBoundaryName).toBe('Kecamatan Contoh');
    expect(state.activeBoundaryLevel).toBe('kecamatan');
    expect(state).not.toHaveProperty('activeBoundaryGeometry');
    expect(state.floodAnalysisResult).toBeNull();
  });
});

