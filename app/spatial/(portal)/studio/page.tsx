import type { Metadata } from "next";
import { academicRequested } from "../../../../lib/academicPreview";
import VectorStudio from "../../../../components/gis/studio/VectorStudio";
import "./studio.css";
export const metadata: Metadata = { title: "Studio Vektor | P4I WebGIS" };
export default function Page() {
  if (academicRequested(process.env))
    return (
      <section>
        <h1>Studio vektor pengguna tidak tersedia pada preview sintetis</h1>
        <p>
          Gunakan lingkungan terpisah yang diizinkan untuk membuka berkas
          yayasan.
        </p>
      </section>
    );
  return <VectorStudio />;
}
