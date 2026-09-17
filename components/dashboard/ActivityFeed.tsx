'use client';

import useSWR from 'swr';

const fetcher = async () => {
  const response = await fetch('/api/admin/audit-logs');
  if (!response.ok) throw new Error(`Audit log request failed (${response.status})`);
  return await response.json() as AuditLog[];
};

interface AuditLog {
  id: string;
  action_type: 'INSERT' | 'UPDATE' | 'DELETE';
  table_name: string;
  created_at: string;
  ip_address: string | null;
  user_profiles: { email?: string | null; role?: string | null } | null;
}

const formatActionText = (log: AuditLog) => {
  const user = log.user_profiles?.email || 'System / Anonymous';
  const table = log.table_name;
  let action: string = log.action_type;
  
  if (action === 'INSERT') action = 'menambahkan data di';
  if (action === 'UPDATE') action = 'memperbarui data di';
  if (action === 'DELETE') action = 'menghapus data dari';

  return (
    <span>
      <strong>{user}</strong> {action} tabel <span className="font-mono bg-slate-100 px-1 rounded">{table}</span>
    </span>
  );
};

export default function ActivityFeed() {
  const { data: logs, error, isLoading } = useSWR('audit_logs_feed', fetcher, { refreshInterval: 30000 });

  if (error) return <div className="text-red-500 text-sm">Gagal memuat feed aktivitas. Pastikan Anda punya akses super_admin.</div>;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-5 border-b border-slate-200 bg-slate-50">
        <h3 className="text-lg font-bold text-slate-800">Aktivitas Terbaru</h3>
      </div>
      <div className="p-0">
        {isLoading ? (
          <div className="p-8 text-center text-slate-500">Memuat log...</div>
        ) : logs?.length === 0 ? (
          <div className="p-8 text-center text-slate-500">Belum ada aktivitas.</div>
        ) : (
          <ul className="divide-y divide-slate-100 max-h-96 overflow-y-auto custom-scrollbar">
            {(logs as AuditLog[] | undefined)?.map((log) => (
              <li key={log.id} className="p-4 hover:bg-slate-50 transition-colors flex items-start gap-3">
                <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${
                  log.action_type === 'INSERT' ? 'bg-green-500' :
                  log.action_type === 'DELETE' ? 'bg-red-500' : 'bg-amber-500'
                }`} />
                <div>
                  <p className="text-sm text-slate-700">{formatActionText(log)}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {new Date(log.created_at).toLocaleString('id-ID')}
                    {log.ip_address && ` • IP: ${log.ip_address}`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
