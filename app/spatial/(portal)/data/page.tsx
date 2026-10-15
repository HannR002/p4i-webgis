import type { Metadata } from 'next';
import { DatasetCatalog } from '../../../../components/gis/PortalPages';
export const metadata: Metadata = { title: 'Data & Metadata | Geoportal P4I' };
export default function Page() {
  return <DatasetCatalog />;
}
