import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('leaflet', () => ({ default: {} }));
vi.mock('swr', () => ({ default: vi.fn(() => ({ data: [], isLoading: false, error: undefined as Error | undefined })) }));
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: ReactNode }) => children,
  Pane: ({ children }: { children: ReactNode }) => children,
  GeoJSON: () => null,
  TileLayer: ({ url }: { url: string }) => createElement('span', null, url),
  useMap: () => ({}),
  useMapEvents: () => ({}),
}));
vi.mock('../store/useMapStore', () => ({
  useMapStore: () => ({
    activeProjectId: null,
    activeBoundaryId: 'existing-real-boundary',
    derivedWeights: { bencana: 0.4, kesuburan: 0.3, kepadatan: 0.3 },
    isCrValid: true,
    mapCenter: [-1.6, 103.62],
    floodAnalysisResult: { tile_url_template: 'https://example.test/real-flood/{z}/{x}/{y}' },
  }),
}));
import SpatialMap from '../components/SpatialMap';
import useSWR from 'swr';

describe('real flood result isolation', () => {
  it('never renders a retained real flood tile in a synthetic demo map', () => {
    expect(renderToStaticMarkup(<SpatialMap demo basemap="none" />)).not.toContain('real-flood');
  });
  it('preserves the real flood tile in the original viewer', () => {
    expect(renderToStaticMarkup(<SpatialMap basemap="none" />)).toContain('real-flood');
  });
  it('shows an actionable message when a project layer request fails', () => {
    vi.mocked(useSWR).mockReturnValueOnce({ data: [], isLoading: false, isValidating: false, error: new Error('RPC unavailable'), mutate: vi.fn() });
    expect(renderToStaticMarkup(<SpatialMap basemap="none" />)).toContain('Layer proyek tidak dapat dimuat');
  });
});
