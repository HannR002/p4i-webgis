'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import type { EventData, Step } from 'react-joyride';

const Joyride = dynamic(() => import('react-joyride').then((module) => module.Joyride), {
  ssr: false,
});

const steps: Step[] = [
  {
    target: 'aside',
    content: 'Selamat datang di P4I Spatial Analytics! Ini adalah Panel Kendali Utama Anda.',
    skipBeacon: true,
  },
  {
    target: '.ahp-simulator-panel',
    content: 'Sesuaikan bobot analitik spasial secara real-time di sini.',
  },
  {
    target: '.export-pdf-btn',
    content: 'Ekspor peta dan ringkasan analisis sebagai laporan PDF.',
  },
];

export default function OnboardingTour() {
  const [runTour, setRunTour] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const checkOnboarding = async () => {
      try {
        const response = await fetch('/api/onboarding', { signal: controller.signal });
        if (!response.ok) return;
        const data: unknown = await response.json();
        if (typeof data === 'object' && data !== null
          && (data as Record<string, unknown>).hasCompleted === false) {
          setRunTour(true);
        }
      } catch (error: unknown) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          console.error('Gagal mengecek status onboarding', error);
        }
      }
    };
    void checkOnboarding();
    return () => controller.abort();
  }, []);

  const handleJoyrideEvent = async ({ status }: EventData) => {
    if (status !== 'finished' && status !== 'skipped') return;
    setRunTour(false);
    try {
      await fetch('/api/onboarding', { method: 'POST' });
    } catch (error: unknown) {
      console.error('Gagal menyimpan status onboarding', error);
    }
  };

  return (
    <Joyride
      steps={steps}
      run={runTour}
      continuous
      onEvent={handleJoyrideEvent}
      options={{
        buttons: ['back', 'skip', 'primary'],
        showProgress: true,
        primaryColor: '#2563eb',
        zIndex: 10000,
      }}
      locale={{
        back: 'Kembali',
        close: 'Tutup',
        last: 'Selesai',
        next: 'Lanjut',
        skip: 'Lewati Tour',
      }}
    />
  );
}
