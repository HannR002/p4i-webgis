import type { Metadata } from 'next';
import { WebmapCatalog } from '../../../../components/gis/PortalPages';
export const metadata: Metadata = { title: 'Katalog Webmap | Geoportal P4I' };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <WebmapCatalog
      initialQuery={typeof params.q === 'string' ? params.q.slice(0, 200) : ''}
    />
  );
}
