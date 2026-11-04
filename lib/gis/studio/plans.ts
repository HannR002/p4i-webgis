import { check, exact, fields, parseDocument, shortText } from "./model";
import type { Scalar, StudioDocument, StudioLayer } from "./model";
export type StudioContext = {
  documentId: string;
  revision: string;
  layers: { id: string; name: string; fields: string[] }[];
};
export type StudioAction =
  | { type: "set_title"; title: string }
  | { type: "set_style"; layerId: string; color: string; opacity: number }
  | { type: "set_visibility"; layerId: string; visible: boolean }
  | { type: "set_filter"; layerId: string; field: string; equals: Scalar }
  | { type: "clear_filter"; layerId: string }
  | { type: "fit_layer"; layerId: string };
export type StudioPlan = {
  documentId: string;
  revision: string;
  provider: "rules" | "ollama";
  model: string | null;
  message: string;
  actions: StudioAction[];
};
export function studioContext(doc: StudioDocument): StudioContext {
  return {
    documentId: doc.id,
    revision: doc.revision,
    layers: doc.layers.map((l) => ({
      id: l.id,
      name: l.name,
      fields: fields(l).slice(0, 80),
    })),
  };
}
export function parseContext(v: unknown): StudioContext {
  exact(v, ["documentId", "revision", "layers"]);
  check(
    shortText(v.documentId, 80) &&
      shortText(v.revision, 80) &&
      Array.isArray(v.layers) &&
      v.layers.length <= 8,
    "Konteks peta tidak sah.",
  );
  const ids = new Set<string>();
  for (const l of v.layers) {
    exact(l, ["id", "name", "fields"]);
    check(
      shortText(l.id, 80) &&
        !ids.has(l.id) &&
        shortText(l.name) &&
        Array.isArray(l.fields) &&
        l.fields.length <= 80 &&
        l.fields.every((f) => shortText(f, 160)),
      "Metadata layer tidak sah.",
    );
    ids.add(l.id);
  }
  return structuredClone(v) as unknown as StudioContext;
}
export function validateActions(
  raw: unknown,
  ctx: StudioContext,
): StudioAction[] {
  check(
    Array.isArray(raw) && raw.length > 0 && raw.length <= 8,
    "Rencana harus berisi 1–8 tindakan tampilan.",
  );
  return raw.map((a) => {
    check(
      a && typeof a === "object" && !Array.isArray(a),
      "Tindakan tidak sah.",
    );
    if (a.type === "set_title") {
      exact(a, ["type", "title"]);
      check(shortText(a.title, 200), "Judul kosong/terlalu panjang.");
      return structuredClone(a) as StudioAction;
    }
    const l = ctx.layers.find((l) => l.id === a.layerId);
    check(l, "Rencana menunjuk layer yang tidak tersedia.");
    switch (a.type) {
      case "set_style":
        exact(a, ["type", "layerId", "color", "opacity"]);
        check(
          typeof a.color === "string" &&
            /^#[0-9a-f]{6}$/i.test(a.color) &&
            typeof a.opacity === "number" &&
            Number.isFinite(a.opacity) &&
            a.opacity >= 0 &&
            a.opacity <= 1,
          "Warna/opasitas tidak sah.",
        );
        break;
      case "set_visibility":
        exact(a, ["type", "layerId", "visible"]);
        check(typeof a.visible === "boolean", "Visibilitas tidak sah.");
        break;
      case "set_filter":
        exact(a, ["type", "layerId", "field", "equals"]);
        check(
          typeof a.field === "string" &&
            l.fields.includes(a.field) &&
            (a.equals === null ||
              typeof a.equals === "boolean" ||
              (typeof a.equals === "string" && a.equals.length <= 4096) ||
              (typeof a.equals === "number" && Number.isFinite(a.equals))),
          "Field/nilai filter tidak sah.",
        );
        break;
      case "clear_filter":
      case "fit_layer":
        exact(a, ["type", "layerId"]);
        break;
      default:
        throw Error(
          "AI hanya boleh mengusulkan judul, style, filter, visibilitas dan fokus. Geometri, overlay, URL dan kode tidak diperbolehkan.",
        );
    }
    return structuredClone(a) as StudioAction;
  });
}
export function applyStudioPlan(
  doc: StudioDocument,
  plan: StudioPlan,
): StudioDocument {
  check(
    plan.documentId === doc.id && plan.revision === doc.revision,
    "Peta berubah. Buat ulang rencana sebelum menerapkan.",
  );
  const actions = validateActions(plan.actions, studioContext(doc));
  let next = { ...doc, layers: [...doc.layers], focus: null as string | null };
  for (const a of actions) {
    if (a.type === "set_title") {
      next = { ...next, title: a.title.trim() };
      continue;
    }
    if (a.type === "fit_layer") {
      next = { ...next, focus: a.layerId };
      continue;
    }
    next = {
      ...next,
      layers: next.layers.map((l) =>
        l.id !== a.layerId
          ? l
          : a.type === "set_style"
            ? { ...l, color: a.color, opacity: a.opacity }
            : a.type === "set_visibility"
              ? { ...l, visible: a.visible }
              : a.type === "set_filter"
                ? { ...l, filter: { field: a.field, equals: a.equals } }
                : { ...l, filter: null },
      ),
    };
  }
  return {
    ...next,
    revision: crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
  };
}
export function localRulePlan(
  prompt: string,
  doc: StudioDocument,
  layer: StudioLayer | undefined,
): StudioPlan {
  const ctx = studioContext(doc);
  let actions: StudioAction[] = [];
  const p = prompt.trim();
  if (/^judul\s*:/i.test(p))
    actions = [{ type: "set_title", title: p.replace(/^judul\s*:\s*/i, "") }];
  else {
    check(layer, "Pilih layer dahulu.");
    if (/^warna\s*:\s*#[0-9a-f]{6}$/i.test(p))
      actions = [
        {
          type: "set_style",
          layerId: layer.id,
          color: p.slice(p.indexOf(":") + 1).trim(),
          opacity: layer.opacity,
        },
      ];
    else if (/^fokus$/i.test(p))
      actions = [{ type: "fit_layer", layerId: layer.id }];
    else if (/^sembunyikan$/i.test(p))
      actions = [{ type: "set_visibility", layerId: layer.id, visible: false }];
    else if (/^tampilkan$/i.test(p))
      actions = [{ type: "set_visibility", layerId: layer.id, visible: true }];
    else if (/^hapus filter$/i.test(p))
      actions = [{ type: "clear_filter", layerId: layer.id }];
    else if (/^filter\s*:/i.test(p)) {
      const m = p.match(/^filter\s*:\s*([^=]+?)\s*=\s*(.+)$/i);
      check(m, "Gunakan filter: nama_field = nilai");
      let value: unknown = m[2].trim();
      try {
        value = JSON.parse(String(value));
      } catch {
        /* Text is a literal, never code. */
      }
      actions = [
        {
          type: "set_filter",
          layerId: layer.id,
          field: m[1].trim(),
          equals: value as Scalar,
        },
      ];
    } else
      throw Error(
        "Aturan lokal tidak memahami kalimat ini. Gunakan judul: ..., warna: #146b70, fokus, filter: field = nilai, atau aktifkan model AI lokal yang telah disiapkan operator.",
      );
  }
  validateActions(actions, ctx);
  return {
    ...ctx,
    provider: "rules",
    model: null,
    message: "Rencana aturan lokal. Ini bukan keluaran model AI/LLM.",
    actions,
  };
}
export function importDocumentText(text: string): StudioDocument {
  check(
    new TextEncoder().encode(text).length <= 25 * 1024 * 1024,
    "Dokumen melebihi 25 MiB.",
  );
  return parseDocument(JSON.parse(text));
}
