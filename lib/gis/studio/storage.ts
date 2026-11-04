import { parseDocument, type StudioDocument } from "./model";
const DB = "p4i-vector-studio-v1";
const STORE = "snapshots";
const SUMMARIES = "summaries";
async function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: "key" });
      request.result.createObjectStore(SUMMARIES, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        Error(
          "Penyimpanan browser tidak tersedia. Unduh dokumen peta sebagai cadangan.",
        ),
      );
  });
}
export async function saveStudioDocument(doc: StudioDocument): Promise<void> {
  const validated = parseDocument(doc);
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE, SUMMARIES], "readwrite");
      const store = tx.objectStore(STORE),
        summaries = tx.objectStore(SUMMARIES);
      const key = `${validated.id}:${validated.revision}`;
      const request = store.getKey(key);
      let limit = false;
      request.onsuccess = () => {
        if (request.result) return;
        const count = summaries.count();
        count.onsuccess = () => {
          if (count.result >= 20) {
            limit = true;
            tx.abort();
            return;
          }
          store.add({ key, document: validated });
          summaries.add({
            key,
            title: validated.title,
            updatedAt: validated.updatedAt,
          });
        };
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () =>
        reject(
          Error(
            limit
              ? "Batas 20 snapshot browser tercapai. Unduh dokumen sebagai cadangan; snapshot lama tidak dihapus."
              : "Simpan dibatalkan. Unduh dokumen sebagai cadangan.",
          ),
        );
      tx.onerror = () =>
        reject(
          Error("Kuota penyimpanan browser tidak cukup. Unduh dokumen peta."),
        );
    });
  } finally {
    db.close();
  }
}
export async function listStudioDocuments(): Promise<
  { key: string; title: string; updatedAt: string }[]
> {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const query = db
        .transaction(SUMMARIES, "readonly")
        .objectStore(SUMMARIES)
        .getAll();
      query.onsuccess = () =>
        resolve(
          query.result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        );
      query.onerror = () => reject(Error("Daftar dokumen tidak dapat dibaca."));
    });
  } finally {
    db.close();
  }
}
export async function loadStudioDocument(key: string): Promise<StudioDocument> {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const query = db
        .transaction(STORE, "readonly")
        .objectStore(STORE)
        .get(key);
      query.onsuccess = () => {
        try {
          resolve(parseDocument(query.result?.document));
        } catch {
          reject(Error("Snapshot tidak ditemukan atau tidak valid."));
        }
      };
      query.onerror = () => reject(Error("Snapshot tidak dapat dibuka."));
    });
  } finally {
    db.close();
  }
}
