import type { Metadata } from 'next';
import MapWorkspace from '../../../../components/gis/MapWorkspace';
export const metadata: Metadata = { title: 'AI GIS Copilot | Geoportal P4I' };
export default function Page() {
  return <MapWorkspace initialPanel="copilot" />;
}
