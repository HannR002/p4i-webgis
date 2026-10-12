'use client';
import type { KeyboardEvent, ReactNode } from 'react';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import useSWR from 'swr';
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
  X,
  UserRound,
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
function Navigation({ path, close }: { path: string; close?: () => void }) {
  return (
    <>
      <Link href="/spatial/home" className="gis-brand" onClick={close}>
        <span className="gis-brand-mark">
          <Compass size={27} aria-hidden="true" />
        </span>
        <span>
          <strong>P4I</strong>
          <small>SPATIAL ANALYTICS</small>
        </span>
      </Link>
      <div className="gis-nav-label">JELAJAHI WILAYAH</div>
      <nav aria-label="Navigasi portal">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            onClick={close}
            key={href}
            href={href}
            aria-current={path === href ? 'page' : undefined}
            className={path === href ? 'active' : ''}
          >
            <Icon size={18} aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="gis-nav-footer">
        <Link href="/spatial" onClick={close}>
          <ChevronLeft size={16} aria-hidden="true" />
          Viewer proyek
        </Link>
        <Link href="/portal" onClick={close}>
          Portal klien
          <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
        <Link href="/" onClick={close}>
          P4I Consultant
          <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
        <p>
          GIS & Spatial Analytics
          <br />
          Yayasan P4I
        </p>
      </div>
    </>
  );
}
async function sessionStatus(): Promise<boolean> {
  const response = await fetch('/api/auth/session');
  if (!response.ok) return false;
  const body: unknown = await response.json();
  return (
    typeof body === 'object' &&
    body !== null &&
    'authenticated' in body &&
    body.authenticated === true
  );
}
export default function PortalShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const { data: authenticated } = useSWR('gis-session', sessionStatus, {
    revalidateOnFocus: true,
  });
  const page =
    links.find((link) => link.href === path)?.label ?? 'Spatial Analytics';
  function close() {
    dialog.current?.close();
  }
  function keepFocus(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab') return;
    const controls = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])',
      ),
    ).filter((element) => element.getClientRects().length > 0);
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
  return (
    <div className="gis-shell">
      <a href="#gis-main-content" className="gis-skip-link">
        Lewati navigasi ke konten
      </a>
      <aside className="gis-nav gis-desktop-nav">
        <Navigation path={path} />
      </aside>
      <dialog
        className="gis-mobile-nav"
        ref={dialog}
        aria-label="Navigasi portal"
        onClose={() => setOpen(false)}
        onKeyDown={keepFocus}
      >
        <div className="gis-mobile-nav-heading">
          <span>Menu portal</span>
          <button
            className="gis-icon-button"
            aria-label="Tutup navigasi"
            onClick={close}
          >
            <X size={20} />
          </button>
        </div>
        <Navigation path={path} close={close} />
      </dialog>
      <div className="gis-main">
        <header className="gis-topbar">
          <button
            className="gis-icon-button gis-menu"
            aria-label="Buka navigasi"
            aria-expanded={open}
            aria-haspopup="dialog"
            onClick={() => {
              dialog.current?.showModal();
              setOpen(true);
            }}
          >
            <Menu size={20} />
          </button>
          <div className="gis-breadcrumb">
            <Link href="/spatial/home">Geoportal P4I</Link>
            <span aria-hidden="true">/</span>
            <span>{page}</span>
          </div>
          <Link
            className="gis-button secondary"
            href={
              authenticated
                ? '/portal'
                : `/login?next=${encodeURIComponent(path)}`
            }
          >
            <UserRound size={16} aria-hidden="true" />
            {authenticated ? 'Portal saya' : 'Masuk'}
          </Link>
        </header>
        <main id="gis-main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
