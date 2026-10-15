'use client';

import dynamic from 'next/dynamic';
import FloatingPanel from '../../components/FloatingPanel';
import GlobalNavFAB from '../../components/GlobalNavFAB';
import Link from 'next/link';

const SpatialMap = dynamic(() => import('../../components/SpatialMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-slate-900 text-white">
      <div className="animate-pulse flex flex-col items-center">
        <div className="h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-lg font-semibold tracking-wider text-slate-300">
          Memuat Peta Spasial...
        </p>
      </div>
    </div>
  ),
});

export default function SpatialPage() {
  return (
    <main className="relative w-screen h-screen overflow-hidden bg-slate-900">
      <Link
        href="/spatial/home"
        className="absolute top-4 left-1/2 -translate-x-1/2 z-[600] rounded-lg bg-white px-4 py-2 text-sm font-semibold text-teal-800 shadow"
      >
        Portal & Map Workspace baru →
      </Link>
      <GlobalNavFAB />
      <FloatingPanel />
      <div className="absolute inset-0 z-0">
        <SpatialMap />
      </div>
    </main>
  );
}
