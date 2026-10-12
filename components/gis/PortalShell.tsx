'use client';
import type { ReactNode } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Compass,
  Map,
  Layers,
  Database,
  FlaskConical,
  BookOpen,
  Sparkles,
  Menu,
  ArrowUpRight,
  ChevronLeft,
} from 'lucide-react';
const links = [
  { href: '/spatial/home', label: 'Beranda', icon: Compass },
  { href: '/spatial/webmap', label: 'Webmap', icon: Map },
  { href: '/spatial/data', label: 'Data & metadata', icon: Database },
  { href: '/spatial/viewer', label: 'Map Workspace', icon: Layers },
  { href: '/spatial/analysis', label: 'Analisis', icon: FlaskConical },
  { href: '/spatial/ai', label: 'AI GIS Copilot', icon: Sparkles },
  { href: '/spatial/help', label: 'Pusat bantuan', icon: BookOpen },
];
export default function PortalShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <div className="gis-shell">
      <aside className={`gis-nav ${open ? 'is-open' : ''}`}>
        <Link href="/spatial/home" className="gis-brand">
          <span className="gis-brand-mark">
            <Compass size={25} />
          </span>
          <span>
            <strong>P4I</strong>
            <small>SPATIAL ANALYTICS</small>
          </span>
        </Link>
        <div className="gis-nav-label">PORTAL GEOSPASIAL</div>
        <nav aria-label="Navigasi portal">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              onClick={() => setOpen(false)}
              key={href}
              href={href}
              aria-current={path === href ? 'page' : undefined}
              className={path === href ? 'active' : ''}
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="gis-nav-footer">
          <Link href="/spatial">
            <ChevronLeft size={15} />
            Viewer sebelumnya
          </Link>
          <Link href="/portal">
            Portal klien <ArrowUpRight size={15} />
          </Link>
          <Link href="/">
            P4I Consultant <ArrowUpRight size={15} />
          </Link>
          <p>
            GIS / Spatial Analytics
            <br />
            Bagian dari ekosistem P4I Consultant
            <br />
            Yayasan P4I
          </p>
        </div>
      </aside>
      <div className="gis-main">
        <header className="gis-topbar">
          <button
            className="gis-icon-button gis-menu"
            aria-label="Buka navigasi"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            <Menu size={20} />
          </button>
          <span>
            P4I Consultant <span className="gis-muted">/ Spatial Analytics</span>
          </span>
          <Link className="gis-button secondary" href="/login">
            Masuk
          </Link>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
