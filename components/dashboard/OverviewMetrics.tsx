'use client';

import useSWR from 'swr';

const fetcher = async () => {
  const res = await fetch('/api/admin/dashboard/metrics');
  if (!res.ok) throw new Error('Gagal memuat metrik');
  return res.json();
};

export default function OverviewMetrics() {
  const { data, error, isLoading } = useSWR('dashboard_metrics', fetcher, { refreshInterval: 60000 });

  if (error) return <div className="text-red-500">Error memuat metrik</div>;
  if (isLoading || !data) return <div className="animate-pulse flex space-x-4"><div className="h-24 bg-slate-200 rounded w-full"></div></div>;

  const storageMB = (data.storageBytes / 1024 / 1024).toFixed(2);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h3 className="text-sm font-semibold text-slate-500 mb-2">Klien B2B Aktif</h3>
        <p className="text-3xl font-bold text-slate-800">{data.activeClients}</p>
      </div>
      
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h3 className="text-sm font-semibold text-slate-500 mb-2">Total Proyek</h3>
        <div className="flex items-baseline gap-2">
          <p className="text-3xl font-bold text-slate-800">{data.projects.total}</p>
          <p className="text-xs font-semibold text-slate-400">
            ({data.projects.restricted} PRO / {data.projects.public} Public)
          </p>
        </div>
      </div>
      
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h3 className="text-sm font-semibold text-slate-500 mb-2">Kapasitas Penyimpanan</h3>
        <p className="text-3xl font-bold text-slate-800">{storageMB} <span className="text-lg text-slate-500">MB</span></p>
      </div>
    </div>
  );
}
