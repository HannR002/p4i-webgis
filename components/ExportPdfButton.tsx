'use client';

import { useRef } from 'react';
import { useMapStore } from '../store/useMapStore';
import { getBand } from '../lib/gis/raster';
import type { Dataset, MapRecipe } from '../lib/gis/contracts';

export default function ExportPdfButton({
  recipe,
  datasets = [],
}: { recipe?: MapRecipe; datasets?: readonly Dataset[] } = {}) {
  const {
    activeProjectId,
    activeBoundaryId,
    activeBoundaryName,
    derivedWeights,
    floodAnalysisResult,
  } = useMapStore();
  const isExporting = useRef(false);
  const activeContextId = recipe?.id ?? activeProjectId ?? activeBoundaryId;
  const exportWeights = recipe?.analysis?.weights ?? derivedWeights;
  const exportFloodResult = recipe ? null : floodAnalysisResult;
  const hiddenElements = useRef<{ element: HTMLElement; visibility: string }[]>(
    [],
  );

  const handleExport = async () => {
    if (isExporting.current || !activeContextId) return;
    isExporting.current = true;

    try {
      const [
        { default: jsPDF },
        { default: html2canvas },
        { default: domtoimage },
      ] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
        import('dom-to-image-more'),
      ]);

      const mapElement = document.querySelector<HTMLElement>(
        recipe ? '[data-gis-export]' : '.leaflet-container',
      );
      const chartElement = document.getElementById(
        'ahp-chart-export',
      ) as HTMLElement;

      if (!mapElement) {
        alert('Peta tidak ditemukan');
        return;
      }

      // 1. Tangkap Chart terlebih dahulu (sebelum panel disembunyikan)
      let chartImgData: string | null = null;
      if (chartElement && !recipe) {
        // Skalakan untuk ketajaman
        const scale = 2;
        chartImgData = await domtoimage.toPng(chartElement, {
          width: chartElement.clientWidth * scale,
          height: chartElement.clientHeight * scale,
          style: {
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            width: `${chartElement.clientWidth}px`,
            height: `${chartElement.clientHeight}px`,
          },
        });
      }

      // 2. Sembunyikan panel overlay agar tidak tertangkap di screenshot peta
      const panelElements = document.querySelectorAll<HTMLElement>(
        '[class*="z-40"], [class*="z-[50]"]',
      );
      hiddenElements.current = Array.from(panelElements).map((element) => ({
        element,
        visibility: element.style.visibility,
      }));
      panelElements.forEach((el) => (el.style.visibility = 'hidden'));

      // Tunggu tile peta ter-render penuh
      await new Promise((resolve) => setTimeout(resolve, 500));

      // 3. Tangkap Peta
      const canvas = await html2canvas(mapElement, {
        useCORS: true,
        allowTaint: false,
        scale: 2,
        logging: false,
        backgroundColor: '#ffffff',
      });

      // Kembalikan visibilitas panel
      hiddenElements.current.forEach(
        ({ element, visibility }) => (element.style.visibility = visibility),
      );

      // 4. Rakitan jsPDF
      const pdf = new jsPDF('landscape', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      // Header
      pdf.setFontSize(18);
      pdf.setFont('helvetica', 'bold');
      pdf.text('P4I Spatial Analytics — Ringkasan Analisis', 14, 18);

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(100);
      pdf.text(
        recipe
          ? recipe.title
          : activeProjectId
            ? `ID Proyek: ${activeProjectId}`
            : `Kecamatan: ${activeBoundaryName ?? activeBoundaryId}`,
        14,
        26,
      );
      pdf.text(
        `Tanggal Cetak: ${new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}`,
        14,
        32,
      );

      // Bobot AHP
      pdf.setTextColor(0);
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text(
        recipe?.analysis?.weightMethod === 'manual-wlc'
          ? 'Bobot langsung WLC (eksperimental):'
          : recipe && !recipe.analysis
            ? 'Bobot preferensi AHP (belum diterapkan):'
            : 'Bobot SMCE / AHP:',
        14,
        44,
      );

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(
        `Bencana (W_d): ${(exportWeights.bencana * 100).toFixed(0)}%`,
        14,
        52,
      );
      pdf.text(
        `Kesuburan (W_f): ${(exportWeights.kesuburan * 100).toFixed(0)}%`,
        80,
        52,
      );
      pdf.text(
        `Kepadatan (W_p): ${(exportWeights.kepadatan * 100).toFixed(0)}%`,
        146,
        52,
      );

      let mapStartY = 60;
      if (exportFloodResult) {
        pdf.setFont('helvetica', 'bold');
        pdf.text(
          `Flood Risk: ${exportFloodResult.score.toFixed(1)} (${exportFloodResult.classification})`,
          14,
          61,
        );
        pdf.setFont('helvetica', 'normal');
        pdf.text(
          `Periode: ${exportFloodResult.period.start} - ${exportFloodResult.period.end} | Model: ${exportFloodResult.model_version}`,
          14,
          67,
        );
        mapStartY = 74;
      }

      // Sisipkan Chart jika ada (Di sebelah kanan teks ringkasan)
      if (chartImgData) {
        // Posisi chart: X = 220, Y = 10, lebar/tinggi sekitar 45mm
        pdf.addImage(chartImgData, 'PNG', 220, 10, 45, 45);
      }

      // Sisipkan Map screenshot
      const imgData = canvas.toDataURL('image/png');
      const imgW = pageWidth - 28;
      const imgH = (canvas.height / canvas.width) * imgW;
      const maxImgH = pageHeight - mapStartY - 10;
      const finalH = Math.min(imgH, maxImgH);

      const finalW = finalH * (canvas.width / canvas.height);
      pdf.addImage(imgData, 'PNG', 14, mapStartY, finalW, finalH);

      // Footer
      pdf.setFontSize(8);
      pdf.setTextColor(150);
      pdf.text(
        'Dihasilkan oleh Sistem P4I Spatial Analytics Engine',
        14,
        pageHeight - 6,
      );

      if (recipe) {
        pdf.addPage();
        pdf.setTextColor(0);
        pdf.setFontSize(16);
        pdf.text('MapRecipe — provenance & methodology', 14, 18);
        pdf.setFontSize(10);
        const lines = [
          `Title: ${recipe.title}`,
          `AOI: ${recipe.aoi?.name ?? 'Not selected'}`,
          `Configuration: ${recipe.provenance === 'ai' ? 'AI-generated map configuration' : 'Human map configuration'}`,
          `Description: ${recipe.description}`,
          `Viewport: ${recipe.viewport.center.join(', ')} / zoom ${recipe.viewport.zoom}`,
          `Weights: ${recipe.analysis ? JSON.stringify(recipe.analysis) : 'No analysis executed'}`,
          ...(recipe.analysisConfiguration
            ? [
                `Analysis configuration: ${recipe.analysisConfiguration.name} | ${recipe.analysisConfiguration.analysisType} | v${recipe.analysisConfiguration.version} | EXPERIMENTAL`,
                `Parameters: ${JSON.stringify(recipe.analysisConfiguration.parameters)}`,
                `Classification rules: ${JSON.stringify(recipe.analysisConfiguration.classificationRules)}`,
                `Configuration inputs: ${recipe.analysisConfiguration.inputDatasetIds.join(', ')}`,
                `Configuration period: ${JSON.stringify(recipe.analysisConfiguration.analysisPeriod)} | native resolution: ${JSON.stringify(recipe.analysisConfiguration.spatialResolution)}`,
                `Configuration notes: ${recipe.analysisConfiguration.notes}`,
                'Saved configuration records settings; it does not establish a real scientific result.',
              ]
            : []),
          ...recipe.layers.flatMap((l) => {
            const d = datasets.find((d) => d.id === l.datasetId);
            return [
              `Layer: ${d?.title ?? l.datasetId} | ${d?.version ?? ''}`,
              `Source: ${d?.source ?? 'unknown'} | ${d?.crs ?? ''}`,
              d?.raster
                ? `Resolution: ${d.raster.resolution.x} x ${d.raster.resolution.y} ${d.raster.resolution.unit} | ${d.raster.period.start} - ${d.raster.period.end}`
                : 'Vector layer',
              ...(d?.raster
                ? [
                    `Band: ${getBand(d.raster, 'band' in l.style ? l.style.band : undefined).id} | ${getBand(d.raster, 'band' in l.style ? l.style.band : undefined).unit} | ${getBand(d.raster, 'band' in l.style ? l.style.band : undefined).kind}`,
                    `Scale/offset: ${getBand(d.raster, 'band' in l.style ? l.style.band : undefined).scale} / ${getBand(d.raster, 'band' in l.style ? l.style.band : undefined).offset} | native pixel size: ${d.raster.scale} ${d.raster.resolution.unit}`,
                    `NoData: ${d.raster.noData.meaning} | origin: ${d.raster.grid.origin.join(', ')} | north-up pixel-area grid`,
                  ]
                : []),
              `Provenance: ${d?.provenance ?? 'unavailable'}`,
            ];
          }),
          'DEMO / provisional methodology: not a scientifically validated result.',
          'Basemap tiles may be omitted if cross-origin capture is unavailable.',
        ];
        let y = 28;
        for (const line of lines) {
          const wrapped = pdf.splitTextToSize(line, 265) as string[];
          for (const item of wrapped) {
            if (y > 190) {
              pdf.addPage();
              y = 18;
            }
            pdf.text(item, 14, y);
            y += 6;
          }
        }
      }

      pdf.save(`P4I_Analisis_${activeContextId.slice(0, 8)}_${Date.now()}.pdf`);

      // Log unduhan PDF
      if (activeProjectId && !recipe) {
        try {
          await fetch('/api/downloads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              project_id: activeProjectId,
              file_type: 'pdf_report',
            }),
          });
        } catch {
          // Abaikan jika log gagal agar tidak mengganggu UX pengguna
        }
      }
    } catch (err) {
      console.error('PDF export error:', err);
      alert('Terjadi kesalahan saat membuat dokumen PDF.');
    } finally {
      hiddenElements.current.forEach(
        ({ element, visibility }) => (element.style.visibility = visibility),
      );
      hiddenElements.current = [];
      isExporting.current = false;
    }
  };

  if (!activeContextId) return null;

  return (
    <button
      onClick={handleExport}
      className="export-pdf-btn w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-gradient-to-r from-indigo-600 to-blue-600 text-white text-sm font-bold rounded-xl shadow-md hover:from-indigo-700 hover:to-blue-700 transition-all active:scale-[0.98]"
    >
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
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
        <line x1="16" y1="13" x2="8" y2="13"></line>
        <line x1="16" y1="17" x2="8" y2="17"></line>
        <polyline points="10 9 9 9 8 9"></polyline>
      </svg>
      Ekspor Ringkasan (PDF)
    </button>
  );
}
