import Link from 'next/link';
export default function AcademicUnavailable() {
  return <main style={{ maxWidth: 760, margin: '40px auto', padding: 24, lineHeight: 1.7 }}>
    <h1 style={{ fontSize: 28, fontWeight: 700 }}>Fitur dan batas preview akademik</h1>
    <p>Preview ini memakai data sintetik untuk demonstrasi perangkat lunak. Tidak ada login akun nyata, akses proyek klien, penyimpanan PostGIS, compute berbayar, atau publikasi laporan resmi.</p>
    <p>Anda dapat membuka katalog, membuat peta, menggambar dan mengedit vektor, mengimpor GeoJSON WGS84 yang diizinkan, menggunakan Undo/Redo, menyimpan draft lokal secara eksplisit, mengekspor peta, serta memeriksa raster sintetik. Copilot memakai aturan deterministik bahasa Indonesia, tanpa model AI eksternal.</p>
    <p>Konfigurasi AHP/WLC tetap eksperimental. Layanan database, GEE, Gemini, job compute, dan workflow persetujuan klien menunggu integrasi terpisah. Status tidak tersedia tidak berarti analisis berhasil.</p>
    <p>Gunakan hanya input publik atau sintetik. Jangan memasukkan data klien, AOI sensitif, kredensial, atau dokumen internal. Draft tersimpan hanya di browser perangkat ini.</p>
    <p><Link href="/spatial/viewer" style={{ textDecoration: 'underline' }}>Buka Map Workspace</Link> · <Link href="/spatial/home" style={{ textDecoration: 'underline' }}>Beranda geoportal</Link></p>
  </main>;
}
