'use client';

import useSWR from 'swr';
import type { AppRole } from '../../../lib/authRoles';

interface AdminUser {
  id: string;
  email: string | null;
  role: AppRole;
  is_disabled: boolean;
}

const fetchUsers = async (): Promise<AdminUser[]> => {
  const res = await fetch('/api/admin/users');
  if (!res.ok) throw new Error('Failed to fetch users');
  return await res.json() as AdminUser[];
};

export default function AdminUsersPage() {
  const { data: users, error, mutate } = useSWR('admin_users', fetchUsers);
  
  const handleRoleChange = async (userId: string, newRole: AppRole) => {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, updates: { role: newRole } })
      });
      if (res.ok) mutate();
    } catch {
      alert('Gagal merubah role');
    }
  };

  const handleStatusChange = async (userId: string, isDisabled: boolean) => {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, updates: { is_disabled: isDisabled } })
      });
      if (res.ok) mutate();
    } catch {
      alert('Gagal merubah status');
    }
  };

  if (error) return <div className="p-8 text-red-500">Error memuat data pengguna. Pastikan Anda adalah Super Admin.</div>;
  if (!users) return <div className="p-8">Memuat...</div>;

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
        <h1 className="text-2xl font-bold text-slate-800 mb-6">Manajemen Pengguna & Akses (Super Admin)</h1>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-700">
              <tr>
                <th className="p-4 font-semibold">Email / ID</th>
                <th className="p-4 font-semibold">Role</th>
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                  <td className="p-4">
                    <div className="font-medium text-slate-800">{user.email || 'N/A'}</div>
                    <div className="text-xs text-slate-400 font-mono">{user.id}</div>
                  </td>
                  <td className="p-4">
                    <select 
                      value={user.role || 'b2b_client'}
                      onChange={(e) => handleRoleChange(user.id, e.target.value as AppRole)}
                      className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-blue-500"
                    >
                      <option value="b2b_client">B2B Client</option>
                      <option value="managerial_analyst">Managerial Analyst</option>
                      <option value="super_admin">Super Admin</option>
                    </select>
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold ${user.is_disabled ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                      {user.is_disabled ? 'Dinonaktifkan' : 'Aktif'}
                    </span>
                  </td>
                  <td className="p-4 flex gap-2">
                    <button 
                      onClick={() => handleStatusChange(user.id, !user.is_disabled)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                        user.is_disabled 
                          ? 'bg-green-600 text-white hover:bg-green-700' 
                          : 'bg-red-100 text-red-600 hover:bg-red-200'
                      }`}
                    >
                      {user.is_disabled ? 'Aktifkan Kembali' : 'Nonaktifkan Akun'}
                    </button>
                    {/* Note: UI untuk Assign Entitlements bisa dibuat berupa Modal, disederhanakan untuk versi ini */}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
