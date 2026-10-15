import type { ReactNode } from 'react';
import PortalShell from '../../../components/gis/PortalShell';
import '../gis.css';
export default function Layout({ children }: { children: ReactNode }) {
  return <PortalShell>{children}</PortalShell>;
}
