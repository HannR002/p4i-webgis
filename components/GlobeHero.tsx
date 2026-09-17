'use client';

import dynamic from 'next/dynamic';
import { useCallback, useRef } from 'react';
import type { GlobeMethods } from 'react-globe.gl';

const Globe = dynamic(() => import('react-globe.gl'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
    </div>
  ),
});

interface ProjectPoint {
  lat: number;
  lng: number;
  size: number;
  radius: number;
  color: string;
}

function seededValue(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

const PROJECT_POINTS: ProjectPoint[] = Array.from({ length: 50 }, (_, index) => ({
  lat: (seededValue(index, 1) - 0.5) * 160,
  lng: (seededValue(index, 2) - 0.5) * 360,
  size: seededValue(index, 3) * 0.15 + 0.05,
  radius: seededValue(index, 4) * 0.8 + 0.2,
  color: ['#3b82f6', '#4f46e5', '#22c55e'][Math.floor(seededValue(index, 5) * 3)],
}));

export default function GlobeHero() {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const handleReady = useCallback(() => {
    const controls = globeRef.current?.controls();
    if (!controls) return;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.2;
    controls.enableZoom = false;
  }, []);

  return (
    <div className="flex h-full w-full cursor-grab items-center justify-center active:cursor-grabbing">
      <Globe
        ref={globeRef}
        width={500}
        height={500}
        backgroundColor="rgba(0,0,0,0)"
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
        bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
        pointsData={PROJECT_POINTS}
        pointAltitude="size"
        pointColor="color"
        pointRadius="radius"
        pointsMerge={false}
        atmosphereColor="#4f46e5"
        atmosphereAltitude={0.2}
        onGlobeReady={handleReady}
      />
    </div>
  );
}
