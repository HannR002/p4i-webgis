'use client';

import { useRef } from 'react';
import { useMapStore } from '../store/useMapStore';

export default function ExportPdfButton() {
  const {
    activeProjectId,
    activeBoundaryId,
    activeBoundaryName,
    derivedWeights,
    floodAnalysisResult,
  } = useMapStore();
  const isExporting = useRef(false);
  const activeContextId = activeProjectId ?? activeBoundaryId;

  const handleExport = async () => {
    if (isExporting.current || !activeContextId) return;
    isExporting.current = true;

    try {
      const [{ default: jsPDF }, { default: html2canvas }, { default: domtoimage }] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
        import('dom-to-image-more')
      ]);

      const mapElement = document.querySelector('.leaflet-container') as HTMLElement;
      const chartElement = document.getElementById('ahp-chart-export') as HTMLElement;

      if (!mapElement) {
        alert('Peta tidak ditemukan');
        return;
      }

      // 1. Tangkap Chart terlebih dahulu (sebelum panel disembunyikan)
      let chartImgData: string | null = null;
      if (chartElement) {
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
      const panelElements = document.querySelectorAll<HTMLElement>('[class*="z-40"], [class*="z-[50]"]');
      panelElements.forEach(el => el.style.visibility = 'hidden');

      // Tunggu tile peta ter-render penuh
      await new Promise(resolve => setTimeout(resolve, 500));

      // 3. Tangkap Peta
      const canvas = await html2canvas(mapElement, {
        useCORS: true,
        allowTaint: true,
        scale: 2,
        logging: false,
        backgroundColor: '#ffffff',
      });

      // Kembalikan visibilitas panel
      panelElements.forEach(el => el.style.visibility = 'visible');

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
        activeProjectId
          ? `ID Proyek: ${activeProjectId}`
          : `Kecamatan: ${activeBoundaryName ?? activeBoundaryId}`,
        14,
        26,
      );
      pdf.text(`Tanggal Cetak: ${new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}`, 14, 32);

      // Bobot AHP
      pdf.setTextColor(0);
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Bobot SMCE / AHP:', 14, 44);
      
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Bencana (W_d): ${(derivedWeights.bencana * 100).toFixed(0)}%`, 14, 52);
      pdf.text(`Kesuburan (W_f): ${(derivedWeights.kesuburan * 100).toFixed(0)}%`, 80, 52);
      pdf.text(`Kepadatan (W_p): ${(derivedWeights.kepadatan * 100).toFixed(0)}%`, 146, 52);

      let mapStartY = 60;
      if (floodAnalysisResult) {
        pdf.setFont('helvetica', 'bold');
        pdf.text(
          `Flood Risk: ${floodAnalysisResult.score.toFixed(1)} (${floodAnalysisResult.classification})`,
          14,
          61,
        );
        pdf.setFont('helvetica', 'normal');
        pdf.text(
          `Periode: ${floodAnalysisResult.period.start} - ${floodAnalysisResult.period.end} | Model: ${floodAnalysisResult.model_version}`,
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

      pdf.addImage(imgData, 'PNG', 14, mapStartY, imgW, finalH);

      // Footer
      pdf.setFontSize(8);
      pdf.setTextColor(150);
      pdf.text('Dihasilkan oleh Sistem P4I Spatial Analytics Engine', 14, pageHeight - 6);

      pdf.save(`P4I_Analisis_${activeContextId.slice(0, 8)}_${Date.now()}.pdf`);
      
      // Log unduhan PDF
      if (activeProjectId) {
        try {
          await fetch('/api/downloads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project_id: activeProjectId, file_type: 'pdf_report' })
          });
        } catch {
          // Abaikan jika log gagal agar tidak mengganggu UX pengguna
        }
      }
    } catch (err) {
      console.error('PDF export error:', err);
      alert('Terjadi kesalahan saat membuat dokumen PDF.');
    } finally {
      isExporting.current = false;
    }
  };

  if (!activeContextId) return null;

  return (
    <button
      onClick={handleExport}
      className="export-pdf-btn w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-gradient-to-r from-indigo-600 to-blue-600 text-white text-sm font-bold rounded-xl shadow-md hover:from-indigo-700 hover:to-blue-700 transition-all active:scale-[0.98]"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline>
      </svg>
      Ekspor Ringkasan (PDF)
    </button>
  );
}
