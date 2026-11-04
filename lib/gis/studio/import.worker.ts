import { parseVectorParts, type ImportPart } from "./import";
self.onmessage = async (event: MessageEvent<{ parts: ImportPart[] }>) => {
  try {
    const parts = event.data.parts;
    const result = await parseVectorParts(parts);
    const files = await Promise.all(
      parts.map(async (p) => ({
        name: p.name,
        bytes: p.bytes.byteLength,
        sha256: Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", p.bytes)),
          (b) => b.toString(16).padStart(2, "0"),
        ).join(""),
      })),
    );
    self.postMessage({ ok: true, ...result, files });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : "Impor gagal.",
    });
  }
};
