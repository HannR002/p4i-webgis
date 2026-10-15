import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
vi.mock('../components/gis/useGisCatalog', () => ({
  useGisCatalog: () => ({ data: undefined, error: undefined }),
}));
import { DatasetCard } from '../components/gis/PortalPages';
import WorkspaceTabs from '../components/gis/WorkspaceTabs';
import { createDemoGisProvider } from '../lib/server/gis/providers/demo';
const dataset = createDemoGisProvider().catalog()[1];
describe('accessible GIS UI states', () => {
  it('provides one keyboard tab stop with tab/panel relationships', () => {
    const html = renderToStaticMarkup(
      <WorkspaceTabs panel="pixel" select={() => {}} />,
    );
    expect(html.match(/role="tab"/g)).toHaveLength(4);
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html).toContain(
      'aria-selected="true" aria-controls="gis-panel-pixel"',
    );
  });
  it('does not offer an unavailable dataset as a working map', () => {
    const html = renderToStaticMarkup(
      <DatasetCard dataset={{ ...dataset, status: 'unavailable' }} />,
    );
    expect(html).toContain('Belum tersedia');
    expect(html).not.toContain('/spatial/viewer?dataset=');
  });
  it('labels synthetic data and exposes provenance without inventing official metadata', () => {
    const html = renderToStaticMarkup(<DatasetCard dataset={dataset} />);
    expect(html).toContain('Demo sintetik');
    expect(html).toContain(dataset.provenance);
    expect(html).toContain('Metadata lengkap');
    expect(html).toContain(`/spatial/viewer?dataset=${dataset.id}`);
  });
});
