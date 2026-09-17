'use client';

import useSWR from 'swr';

interface DownloadItem {
  id: string;
  file_type: 'pdf_report' | 'geojson_export' | 'image_export';
  downloaded_at: string;
  spatial_projects: { title: string } | null;
}

const fetcher = async (): Promise<DownloadItem[]> => {
  const res = await fetch('/api/downloads');
  if (!res.ok) throw new Error('Gagal memuat riwayat unduhan');
  return await res.json() as DownloadItem[];
};

export default function DownloadHistory() {
  const { data: history, error, isLoading } = useSWR('portal_downloads', fetcher);

  if (error) return <div className="text-red-500 text-sm">Gagal memuat riwayat unduhan.</div>;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-5 border-b border-slate-200 bg-slate-50">
        <h3 className="text-lg font-bold text-slate-800">Riwayat Unduhan & Laporan</h3>
      </div>
      <div className="p-0">
        {isLoading ? (
          <div className="p-8 text-center text-slate-500">Memuat riwayat...</div>
        ) : history?.length === 0 ? (
          <div className="p-8 text-center text-slate-500">Anda belum pernah mengunduh laporan apapun.</div>
        ) : (
          <ul className="divide-y divide-slate-100 max-h-96 overflow-y-auto custom-scrollbar">
            {history?.map((item) => (
              <li key={item.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center gap-4">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                  {item.file_type === 'pdf_report' ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-700">
                    Ekspor {item.file_type === 'pdf_report' ? 'PDF Laporan Eksekutif' : 'Citra Peta Resolusi Tinggi'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Proyek: <span className="font-semibold text-slate-700">{item.spatial_projects?.title || 'Dihapus'}</span>
                  </p>
                </div>
                <div className="text-xs text-slate-400 font-mono text-right">
                  {new Date(item.downloaded_at).toLocaleDateString('id-ID')}<br/>
                  {new Date(item.downloaded_at).toLocaleTimeString('id-ID')}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
