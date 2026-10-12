import type { Metadata } from 'next';
import { HelpCenter } from '../../../../components/gis/PortalPages';
export const metadata: Metadata = { title: 'Pusat Bantuan | Geoportal P4I' };
export default function Page() {
  return <HelpCenter />;
}
