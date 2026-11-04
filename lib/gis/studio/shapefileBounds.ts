import { check, STUDIO_LIMITS } from "./model";
/** Bound counts and record offsets before the vendor parser allocates geometry arrays. */
export function inspectShapefile(
  shape: ArrayBuffer,
  index: ArrayBuffer,
  attributes: ArrayBuffer,
): void {
  const s = new DataView(shape),
    i = new DataView(index),
    d = new DataView(attributes);
  const count = (index.byteLength - 100) / 8;
  const globalType = s.getInt32(32, true);
  check(
    [1, 3, 5, 8, 11, 13, 15, 18, 21, 23, 25, 28].includes(globalType),
    "Tipe Shapefile tidak didukung. Multipatch harus dikonversi di ArcGIS.",
  );
  const header = d.getUint16(8, true),
    recordLength = d.getUint16(10, true);
  check(
    header >= 33 &&
      (header - 33) % 32 === 0 &&
      (header - 33) / 32 <= STUDIO_LIMITS.attributes &&
      recordLength >= 1 &&
      header + count * recordLength <= attributes.byteLength,
    "Header/ukuran tabel DBF tidak sah.",
  );
  let offset = 100,
    records = 0,
    vertices = 0;
  while (offset < shape.byteLength) {
    check(
      records < count && offset + 12 <= shape.byteLength,
      "Record Shapefile terpotong.",
    );
    const words = s.getInt32(offset + 4),
      start = offset + 8,
      length = words * 2;
    check(
      length >= 4 &&
        start + length <= shape.byteLength &&
        i.getInt32(100 + records * 8) * 2 === offset &&
        i.getInt32(104 + records * 8) === words,
      "Offset/ukuran SHP dan SHX tidak cocok.",
    );
    const type = s.getInt32(start, true);
    check(
      type === 0 || type === globalType,
      "Tipe record berbeda dari header.",
    );
    if ([1, 11, 21].includes(type)) {
      check(length >= (type === 11 ? 28 : 20), "Record titik terpotong.");
      vertices++;
    } else if (type !== 0) {
      const multi = [8, 18, 28].includes(type);
      check(length >= (multi ? 40 : 44), "Header geometri terpotong.");
      const parts = multi ? 0 : s.getInt32(start + 36, true),
        points = s.getInt32(start + (multi ? 36 : 40), true);
      check(
        points > 0 &&
          points <= STUDIO_LIMITS.vertices &&
          (multi || (parts > 0 && parts <= points)),
        "Jumlah bagian/vertex tidak sah.",
      );
      const coordinateOffset = (multi ? 40 : 44) + 4 * parts;
      const minBytes =
        coordinateOffset +
        16 * points +
        ([13, 15, 18].includes(type) ? 16 + 8 * points : 0);
      check(
        length >= minBytes,
        "Array koordinat tidak cocok dengan ukuran record.",
      );
      if (!multi) {
        let previous = -1;
        for (let p = 0; p < parts; p++) {
          const n = s.getInt32(start + 44 + 4 * p, true);
          check(
            n >= 0 && n < points && n > previous && (p !== 0 || n === 0),
            "Indeks bagian geometri tidak sah.",
          );
          previous = n;
        }
      }
      vertices += points;
    }
    check(vertices <= STUDIO_LIMITS.vertices, "Total vertex melebihi 150.000.");
    offset = start + length;
    records++;
  }
  check(
    offset === shape.byteLength && records === count,
    "Jumlah record SHP/SHX/DBF berbeda.",
  );
}
