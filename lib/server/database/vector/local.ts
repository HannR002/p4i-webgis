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
export function getLocalVectorRepository(token: string | null) {
  const endpoint = localVectorEndpoint();
  if (!endpoint)
    throw new VectorStorageError(
      503,
      'Penyimpanan proyek belum tersedia; draft lokal tetap dapat digunakan.',
    );
  if (token && (token.length > 8192 || /[\r\n]/.test(token)))
    throw new VectorStorageError(401, 'Identitas tidak valid');
  return createVectorRepository(async (operation, input) => {
    let response: Response;
    try {
      response = await fetch(`${endpoint}/rpc/p4i_vector_store`, {
        method: 'POST',
        redirect: 'error',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ operation, input }),
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
        code === 'PT409'
          ? 409
          : response.status === 401
            ? 401
            : code === '42501' || response.status === 403
              ? 403
              : code.startsWith('22') || code === '23514'
                ? 400
                : 503;
      throw new VectorStorageError(
        status,
        status === 409
          ? 'Konflik revisi. Edit lokal dipertahankan; muat ulang setelah meninjau perubahan.'
          : status === 401 || status === 403
            ? 'Akses proyek ditolak'
            : status === 400
              ? 'Geometri atau atribut ditolak database'
              : 'Penyimpanan proyek gagal; edit lokal dipertahankan.',
      );
    }
    return readProviderJSON(response);
  });
}
