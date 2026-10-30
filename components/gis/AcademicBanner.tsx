'use client';
import useSWR from 'swr';
import Link from 'next/link';
async function status() {
  const r = await fetch('/api/academic/status');
  if (!r.ok) return { enabled: false };
  return r.json() as Promise<{ enabled: boolean }>;
}
export default function AcademicBanner() {
  const { data } = useSWR('academic-preview-status', status, { revalidateOnFocus: false });
  if (!data?.enabled) return null;
  return <aside aria-label="Preview akademik" style={{ background: '#fff8e5', color: '#713f12', padding: '12px 20px', fontSize: 14, lineHeight: 1.5 }}>
    <strong>PREVIEW AKADEMIK · DATA SINTETIK</strong><br />
    Planner deterministik, tanpa LLM. Tidak terhubung ke database klien. Hasil bukan pengukuran resmi.{' '}
    <Link href="/academic-unavailable" style={{ textDecoration: 'underline' }}>Fitur dan batas preview</Link>
  </aside>;
}
