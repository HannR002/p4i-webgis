import { NextResponse } from 'next/server';
import { apiErrorResponse, readJsonBody } from '../../../lib/server/http';
import { demoEnabled } from '../../../lib/gis/mode';

const METRICS = ['kemiringan_lereng', 'jarak_sungai', 'curah_hujan', 'kepadatan_penduduk'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  try {
    if (!demoEnabled(process.env)) {
      return NextResponse.json({ status: 'unavailable', error: 'Provider rekomendasi belum dikonfigurasi.' }, { status: 503 });
    }
    const body: unknown = await readJsonBody(request);
    if (!isRecord(body) || Object.keys(body).some((key) => !METRICS.includes(key as (typeof METRICS)[number]))) {
      return NextResponse.json({ error: 'Payload metrik spasial tidak valid' }, { status: 400 });
    }
    if (METRICS.some((metric) => typeof body[metric] !== 'number' || !Number.isFinite(body[metric]) || Number(body[metric]) < 0)) {
      return NextResponse.json({ error: 'Semua metrik wajib berupa angka non-negatif' }, { status: 400 });
    }

    // Mock response dipertahankan sampai provider LLM server-side disetujui.
    return NextResponse.json({
      demo: true,
      provider: 'deterministic-demo',
      disclaimer: 'Contoh sintetik, bukan hasil analisis atau rekomendasi ilmiah tervalidasi.',
      rekomendasi_utama: 'Kawasan Industri Logistik & Pergudangan Terpadu',
      skor_kelayakan: 88,
      risiko_mitigasi: [
        'Potensi limpasan hujan tinggi; sediakan sumur resapan dan drainase vertikal.',
        'Kemiringan memerlukan kajian cut-and-fill serta retaining wall.',
      ],
      tindakan_lanjutan: 'Lakukan soil-test untuk menentukan daya dukung pondasi.',
    });
  } catch (error: unknown) {
    return apiErrorResponse(error, 'POST /api/ai-recommendation');
  }
}

