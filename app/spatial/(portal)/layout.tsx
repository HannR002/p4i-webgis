import type { ReactNode } from 'react';
import PortalShell from '../../../components/gis/PortalShell';
import '../gis.css';
import { academicRequested } from '../../../lib/academicPreview';
export default function Layout({ children }: { children: ReactNode }) {
  return <PortalShell vectorStudioEnabled={!academicRequested(process.env)}>{children}</PortalShell>;
}
