import { it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("next/dynamic", () => ({
  default: () => () => <div>Peta dimuat di browser</div>,
}));
import VectorStudio from "../components/gis/studio/VectorStudio";
it("starts with no fabricated foundation data, explicit ArcGIS responsibility and locally processed imports", () => {
  const html = renderToStaticMarkup(<VectorStudio />);
  expect(html).toContain("Belum ada data yayasan");
  expect(html).toContain(
    "Overlay, pembobotan dan penilaian tetap dilakukan di ArcGIS",
  );
  expect(html).toContain("Tidak ada skor yang dibuat dari nama wilayah");
  expect(html).toContain("Pilih paket vektor");
  expect(html).toContain("Izin penggunaan belum dikonfirmasi");
  expect(html).not.toContain("AHP Simulator");
});
