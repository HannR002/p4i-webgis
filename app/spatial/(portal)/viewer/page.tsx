import type { Metadata } from 'next';
import MapWorkspace from '../../../../components/gis/MapWorkspace';
export const metadata: Metadata = { title: 'Map Workspace | Geoportal P4I' };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = await searchParams;
  return (
    <MapWorkspace
      key={`${typeof p.webmap === 'string' ? p.webmap : ''}:${typeof p.dataset === 'string' ? p.dataset : ''}`}
      webmap={typeof p.webmap === 'string' ? p.webmap : undefined}
      dataset={typeof p.dataset === 'string' ? p.dataset : undefined}
    />
  );
}
