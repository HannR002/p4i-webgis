import 'server-only';
import { createVectorRepository, VectorStorageError } from './repository';
/** No external URL, production activation or service key is accepted in this phase. */
export function localVectorEndpoint(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | null {
  if (
    env.NODE_ENV === 'production' ||
    env.VECTOR_STORAGE_MODE !== 'local-postgis' ||
    env.VECTOR_STORAGE_LOCAL_ACK !== 'synthetic-only'
  )
    return null;
  try {
    const url = new URL(env.VECTOR_STORAGE_LOCAL_URL ?? '');
    if (
      url.protocol !== 'http:' ||
      url.hostname !== '127.0.0.1' ||
      !url.port ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}
async function readProviderJSON(response: Response): Promise<unknown> {
  const reader = response.body?.getReader(),
    decoder = new TextDecoder();
  let bytes = 0,
    text = '';
  try {
    if (reader)
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 262144) {
          await reader.cancel();
          throw new VectorStorageError(502, 'Respons backend terlalu besar');
        }
        text += decoder.decode(value, { stream: true });
      }
    text += decoder.decode();
    return JSON.parse(text);
  } catch (e) {
    if (e instanceof VectorStorageError) throw e;
    throw new VectorStorageError(
      503,
      'Respons backend tidak tersedia atau tidak valid',
    );
  }
}
export function localVectorRpc(
  token: string | null,
  rpc: 'p4i_vector_store' | 'p4i_vector_analyze',
) {
  const endpoint = localVectorEndpoint();
  if (!endpoint)
    throw new VectorStorageError(
      503,
      'Penyimpanan proyek belum tersedia; draft lokal tetap dapat digunakan.',
    );
  if (token && (token.length > 8192 || /[\r\n]/.test(token)))
    throw new VectorStorageError(401, 'Identitas tidak valid');
  return async (body: unknown) => {
    let response: Response;
    try {
      response = await fetch(`${endpoint}/rpc/${rpc}`, {
        method: 'POST',
        redirect: 'error',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new VectorStorageError(503, 'Backend vektor lokal tidak tersedia');
    }
    if (!response.ok) {
      // Never expose SQL/provider errors, request bodies or credentials.
      const raw = await readProviderJSON(response).catch(() => ({}));
      const code =
        typeof raw === 'object' &&
        raw !== null &&
        'code' in raw &&
        typeof raw.code === 'string'
          ? raw.code
          : '';
      const status =
        code === 'PT429'
          ? 429
          : code === '57014'
            ? 408
            : code === 'PT409'
              ? 409
              : response.status === 401
                ? 401
                : code === '42501' || response.status === 403
                  ? 403
                  : code.startsWith('22') || code === '23514'
                    ? 400
                    : 503;
      const reasons: Record<string, string> = {
        'Extent or latitude unsupported':
          'Cakupan harus ≤1° dan latitude di antara −70° hingga 70°; antimeridian tidak didukung.',
        'Buffer crosses UTM zone/hemisphere':
          'Buffer melintasi zona UTM atau khatulistiwa; pecah input secara eksplisit.',
        'Measurement geometry mismatch':
          'Luas membutuhkan polygon; panjang membutuhkan garis.',
        'Within requires points and polygon mask':
          'Within membutuhkan sumber titik dan pembanding polygon.',
        'Clip mask must contain only polygons': 'Mask clip harus polygon.',
        'Polygon mask required': 'Mask clip harus polygon.',
        'Dissolve attribute missing':
          'Atribut dissolve harus tersedia pada setiap fitur.',
        'Resource ceiling exceeded':
          'Batas fitur atau vertex terlampaui; kurangi input.',
        'Output byte limit': 'Hasil melebihi batas 64 KiB; kurangi input.',
        'Unsupported/oversized result':
          'Geometri hasil tidak didukung atau melebihi batas; komponen tidak dibuang.',
        'Part limit':
          'Hasil melebihi delapan bagian; tidak ada komponen yang dibuang.',
        'Vertex limit':
          'Hasil melebihi batas vertex editor; sumber tetap utuh.',
        'Invalid result (not repaired)':
          'Geometri hasil tidak valid; perbaikan otomatis tidak dilakukan.',
      };
      const reason =
        typeof raw === 'object' &&
        raw !== null &&
        'message' in raw &&
        typeof raw.message === 'string' &&
        Object.hasOwn(reasons, raw.message)
          ? reasons[raw.message]
          : null;
      throw new VectorStorageError(
        status,
        status === 429
          ? 'Batas operasi bersamaan tercapai; coba lagi.'
          : status === 408
            ? 'Batas waktu komputasi terlampaui; kurangi input.'
            : status === 409
              ? 'Konflik revisi. Edit lokal dipertahankan; muat ulang setelah meninjau perubahan.'
              : status === 401 || status === 403
                ? 'Akses proyek ditolak'
                : status === 400
                  ? (reason ?? 'Geometri atau atribut ditolak database')
                  : 'Penyimpanan proyek gagal; edit lokal dipertahankan.',
      );
    }
    return readProviderJSON(response);
  };
}

export function getLocalVectorRepository(token: string | null) {
  const rpc = localVectorRpc(token, 'p4i_vector_store');
  return createVectorRepository((operation, input) =>
    rpc({ operation, input }),
  );
}
