'use client';

import { useRef, useState } from 'react';
import { useMapStore } from '../store/useMapStore';
import type { MapRecipe } from '../lib/gis/contracts';

export default function ExportImageButton({ recipe }: { recipe?: MapRecipe } = {}) {
  const { activeProjectId, activeBoundaryId } = useMapStore();
  const activeContextId = recipe?.id ?? activeProjectId ?? activeBoundaryId;
  const hiddenElements = useRef<{ element: HTMLElement; visibility: string }[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (isExporting || !activeContextId) return;
    setIsExporting(true);

    try {
      const domtoimage = (await import('dom-to-image-more')).default;

      const mapElement = document.querySelector<HTMLElement>(
        recipe ? '[data-gis-export]' : '.leaflet-container',
      );
      if (!mapElement) {
        alert('Peta tidak ditemukan');
        return;
      }

      // Sembunyikan panel overlay agar tidak tertangkap di screenshot
      const panelElements = document.querySelectorAll<HTMLElement>(
        '[class*="z-40"], [class*="z-[50]"]',
      );
      hiddenElements.current = Array.from(panelElements).map((element) => ({
        element,
        visibility: element.style.visibility,
      }));
      panelElements.forEach((el) => (el.style.visibility = 'hidden'));

      // Tunggu sebentar agar perenderan bersih
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Konfigurasi ekspor resolusi tinggi (skala 2x)
      const scale = 2;
      const dataUrl = await domtoimage.toPng(mapElement, {
        width: mapElement.clientWidth * scale,
        height: mapElement.clientHeight * scale,
        style: {
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          width: `${mapElement.clientWidth}px`,
          height: `${mapElement.clientHeight}px`,
        },
      });

      // Kembalikan visibilitas panel
      hiddenElements.current.forEach(
        ({ element, visibility }) => (element.style.visibility = visibility),
      );

      // Trigger download
      const link = document.createElement('a');
      link.download = `P4I_Peta_${activeContextId.slice(0, 8)}_${Date.now()}.png`;
      link.href = dataUrl;
      link.click();

      // Log unduhan Citra Gambar ke tabel download_history
      if (activeProjectId && !recipe) {
        try {
          await fetch('/api/downloads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project_id: activeProjectId, file_type: 'image_export' }),
          });
        } catch (err) {
          console.warn('Gagal mencatat log unduhan gambar', err);
        }
      }
    } catch (err) {
      console.error('Image export error:', err);
      alert('Terjadi kesalahan saat menghasilkan gambar resolusi tinggi.');
      // Pastikan panel kembali terlihat meskipun gagal
    } finally {
      hiddenElements.current.forEach(
        ({ element, visibility }) => (element.style.visibility = visibility),
      );
      hiddenElements.current = [];
      setIsExporting(false);
    }
  };

  if (!activeContextId) return null;

  return (
    <button
      onClick={handleExport}
      disabled={isExporting}
      className={`export-img-btn w-full flex items-center justify-center gap-2 py-2.5 px-4 mt-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-bold rounded-xl shadow-md hover:from-emerald-700 hover:to-teal-700 transition-all active:scale-[0.98] ${isExporting ? 'opacity-70 cursor-not-allowed' : ''}`}
    >
      {isExporting ? (
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
        </svg>
      )}
      {isExporting ? 'Memproses Citra...' : 'Ekspor Citra Peta (PNG)'}
    </button>
  );
}
