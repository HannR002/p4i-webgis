import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
vi.mock('../store/useMapStore', () => ({
  useMapStore: () => ({
    activeProjectId: null,
    activeBoundaryId: null,
    floodAnalysisResult: { score: 91 },
    pairwiseValues: { bencanaVsKesuburan: 1, bencanaVsKepadatan: 1, kesuburanVsKepadatan: 1 },
    derivedWeights: { bencana: 1 / 3, kesuburan: 1 / 3, kepadatan: 1 / 3 },
    crValue: 0,
    isCrValid: true,
    updatePairwise: vi.fn(),
  }),
}));
import AhpSimulatorPanel from '../components/AhpSimulatorPanel';
describe('AHP workspace integration', () => {
  it('renders preferences without a legacy AOI and excludes retained real flood context', () => {
    const html = renderToStaticMarkup(<AhpSimulatorPanel standalone />);
    expect(html.match(/type="range"/g)).toHaveLength(3);
    expect(html).toContain('Consistency Ratio');
    expect(html).not.toContain('Skor banjir aktif');
  });
  it('preserves the original viewer selection requirement', () => {
    expect(renderToStaticMarkup(<AhpSimulatorPanel />)).toBe('');
  });
});
