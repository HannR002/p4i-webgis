import type { Metadata } from 'next';
import { PortalHome } from '../../../../components/gis/PortalPages';
export const metadata: Metadata = { title: 'Beranda | Geoportal P4I' };
export default function Page() {
  return <PortalHome />;
}
