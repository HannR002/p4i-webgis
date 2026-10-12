'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Map, Search, Layers, Database, Sparkles, BookOpen } from 'lucide-react';
import { WEBMAPS } from '../../lib/gis/catalog';
import { useGisCatalog } from './useGisCatalog';
export function DataModeBanner() {
  const { data, error } = useGisCatalog();
  return (
    <div className={`gis-mode ${data?.mode === 'demo' ? 'demo' : ''}`} role="status">
      {error
        ? 'Katalog tidak dapat dimuat. Coba muat ulang.'
        : data?.mode === 'demo'
          ? 'MODE DEMO · Data sintetik untuk review antarmuka. Bukan data resmi atau hasil ilmiah tervalidasi.'
          : data
            ? 'Dataset contoh belum aktif. Integrasi dataset produksi sedang disiapkan.'
            : 'Memuat katalog…'}
    </div>
  );
}
export function PortalHome() {
  return (
    <div className="gis-page">
      <div className="gis-eyebrow">P4I CONSULTANT / GIS & SPATIAL ANALYTICS</div>
      <section className="gis-hero">
        <div>
          <span className="gis-kicker">INFORMASI · ANALISIS · KEPUTUSAN</span>
          <h1>
            Memahami wilayah.
            <br />
            <em>Membangun keputusan.</em>
          </h1>
          <p>
            Temukan data geospasial, susun peta, dan jelajahi analisis dalam satu ruang kerja P4I.
          </p>
          <div className="gis-actions">
            <Link className="gis-button" href="/spatial/viewer">
              Buka Map Workspace <ArrowRight size={17} />
            </Link>
            <Link className="gis-button secondary" href="/spatial/webmap">
              Jelajahi Webmap
            </Link>
          </div>
        </div>
        <div className="gis-hero-art" aria-hidden="true">
          <div className="gis-contour c1" />
          <div className="gis-contour c2" />
          <div className="gis-contour c3" />
          <div className="gis-contour c4" />
          <span className="gis-art-pin">P4I</span>
          <small>SPATIAL INTELLIGENCE</small>
        </div>
      </section>
      <DataModeBanner />
      <div className="gis-section-heading">
        <h2>Mulai eksplorasi Anda</h2>
        <span className="gis-muted">Dari data menuju peta</span>
      </div>
      <div className="gis-grid four">
        {[
          {
            title: 'Webmap',
            text: 'Peta tematik untuk eksplorasi wilayah.',
            href: '/spatial/webmap',
            icon: Map,
          },
          {
            title: 'Data & metadata',
            text: 'Sumber, resolusi, periode, dan lisensi.',
            href: '/spatial/data',
            icon: Database,
          },
          {
            title: 'AI GIS Copilot',
            text: 'Susun konfigurasi peta dari instruksi.',
            href: '/spatial/ai',
            icon: Sparkles,
          },
          {
            title: 'Pusat bantuan',
            text: 'Panduan penggunaan dan standar data.',
            href: '/spatial/help',
            icon: BookOpen,
          },
        ].map(({ title, text, href, icon: Icon }) => (
          <Link key={href} href={href} className="gis-card gis-shortcut">
            <Icon size={23} />
            <h3>{title}</h3>
            <p>{text}</p>
            <ArrowRight size={17} />
          </Link>
        ))}
      </div>
      <div className="gis-section-heading">
        <h2>Webmap pilihan</h2>
        <Link href="/spatial/webmap">Lihat semua →</Link>
      </div>
      <WebmapCards limit={3} />
    </div>
  );
}
function WebmapCards({ limit = 6, query = '' }: { limit?: number; query?: string }) {
  return (
    <div className="gis-grid">
      {WEBMAPS.filter((m) =>
        (m.title + ' ' + m.category).toLowerCase().includes(query.toLowerCase()),
      )
        .slice(0, limit)
        .map((m) => (
          <article className="gis-card gis-webmap" key={m.id}>
            <div
              className="gis-map-thumbnail"
              style={{ backgroundColor: m.color }}
              aria-hidden="true"
            >
              <span />
              <span />
              <span />
              <Map size={40} />
              <small>P4I • DEMO</small>
            </div>
            <div className="gis-card-body">
              <div className="gis-card-meta">
                <span>{m.category}</span>
                <span>Publik · contoh</span>
              </div>
              <h3>{m.title}</h3>
              <p>{m.description}</p>
              <small className="gis-muted">Sumber: fixture sintetik P4I · versi demo-v1</small>
              <Link className="gis-card-link" href={`/spatial/viewer?webmap=${m.id}`}>
                Lihat Peta <ArrowRight size={16} />
              </Link>
            </div>
          </article>
        ))}
    </div>
  );
}
export function WebmapCatalog() {
  const [query, setQuery] = useState('');
  return (
    <div className="gis-page">
      <div className="gis-eyebrow">KATALOG PETA</div>
      <h1>Webmap</h1>
      <p className="gis-lead">
        Peta tematik untuk melihat konteks wilayah dan memulai kajian Anda.
      </p>
      <DataModeBanner />
      <label className="gis-search">
        <Search size={18} />
        <input
          aria-label="Cari webmap"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari peta atau kategori…"
        />
      </label>
      <WebmapCards query={query} />
      {!WEBMAPS.some((m) =>
        (m.title + ' ' + m.category).toLowerCase().includes(query.toLowerCase()),
      ) && <p>Tidak ada peta yang cocok.</p>}
    </div>
  );
}
export function DatasetCatalog() {
  const { data } = useGisCatalog();
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const items = (data?.datasets ?? []).filter(
    (d) =>
      (type === 'all' || d.type === type) &&
      (d.title + ' ' + d.tags.join(' ')).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="gis-page">
      <div className="gis-eyebrow">KATALOG DATA</div>
      <h1>Data & metadata</h1>
      <p className="gis-lead">
        Kenali sumber dan batas penggunaan sebelum menambahkan data ke peta.
      </p>
      <DataModeBanner />
      <div className="gis-actions">
        <label className="gis-search">
          <Search size={18} />
          <input
            aria-label="Cari dataset"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari dataset…"
          />
        </label>
        <select aria-label="Jenis dataset" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">Semua jenis</option>
          <option value="vector">Vektor</option>
          <option value="raster">Raster</option>
        </select>
      </div>
      <div className="gis-grid">
        {items.map((d) => (
          <article className="gis-card gis-card-body" key={d.id}>
            <div className="gis-card-meta">
              <span>{d.category}</span>
              <span>{d.type.toUpperCase()}</span>
            </div>
            <h3>
              <Layers size={18} />
              {d.title}
            </h3>
            <p>{d.description}</p>
            <dl className="gis-metadata">
              <dt>Sumber</dt>
              <dd>{d.source}</dd>
              <dt>CRS</dt>
              <dd>{d.crs}</dd>
              <dt>Versi</dt>
              <dd>{d.version}</dd>
              <dt>Resolusi</dt>
              <dd>
                {d.raster
                  ? `${d.raster.resolution.x} × ${d.raster.resolution.y} ${d.raster.resolution.unit}`
                  : 'Vektor'}
              </dd>
              <dt>Format</dt>
              <dd>{d.formats.join(', ')}</dd>
              <dt>Cakupan</dt>
              <dd>Area sintetik sekitar Jambi</dd>
              <dt>Akses</dt>
              <dd>{d.accessTier}</dd>
              <dt>Lisensi</dt>
              <dd>{d.license}</dd>
              <dt>Pembaruan</dt>
              <dd>{d.updatedAt}</dd>
            </dl>
            <details>
              <summary>Provenance & informasi band</summary>
              <p>{d.provenance}</p>
              {d.raster && (
                <p>
                  {d.raster.bands.map((b) => `${b.id} (${b.unit})`).join(', ')}
                  <br />
                  {d.raster.period.start} — {d.raster.period.end}
                  <br />
                  NoData: {d.raster.noData.meaning}
                  <br />
                  Resampling: {d.raster.resampling}
                </p>
              )}
            </details>
            <Link className="gis-card-link" href={`/spatial/viewer?dataset=${d.id}`}>
              Tinjau di workspace <ArrowRight size={16} />
            </Link>
            <small className="gis-muted">
              {d.status === 'demo'
                ? 'Unduh contoh GeoJSON tersedia untuk vektor dalam viewer.'
                : 'Unduhan belum tersedia.'}{' '}
              Raster sumber tidak tersedia untuk unduhan.
            </small>
          </article>
        ))}
      </div>
      {data && !items.length && <p>Tidak ada dataset yang cocok.</p>}
    </div>
  );
}
const help = [
  {
    title: 'Panduan Memulai',
    text: 'Buka Webmap atau workspace. Pilih dataset di tab Layer. Data demo ditandai; hindari menggunakannya untuk keputusan nyata.',
  },
  {
    title: 'Panduan Webmap',
    text: 'Kartu Webmap membuka resep layer tematik. Anda bisa mengubah judul, basemap, opacity dan urutan layer, lalu menyimpan draft lokal.',
  },
  {
    title: 'Panduan Data Spasial',
    text: 'Vektor memiliki fitur titik, garis, atau polygon. Raster memiliki sel, band, satuan, periode, CRS dan resolusi. Sel dari resolusi berbeda tidak otomatis sebanding.',
  },
  {
    title: 'Panduan Analisis AHP',
    text: 'Gunakan tab Analisis untuk perbandingan berpasangan. Tinjau Consistency Ratio sebelum menyimpan bobot dalam resep. Skor tanpa data kriteria tidak dihitung.',
  },
  {
    title: 'Panduan Analisis Banjir',
    text: 'Model banjir memakai hujan, kemiringan, tanah, dan tutupan lahan. Ambang serta bobot menunggu validasi P4I. GEE dan batas wilayah resmi harus dikonfigurasi sebelum komputasi nyata.',
  },
  {
    title: 'Panduan AI GIS',
    text: 'Copilot demo memahami beberapa instruksi Indonesia. Tinjau tindakan, lalu terapkan. Ia mengubah MapRecipe dan tidak mengeksekusi SQL atau kode. Gunakan Undo untuk membatalkan.',
  },
  {
    title: 'Panduan Upload Data',
    text: 'Upload proyek yang ada tetap tersedia bagi peran yang diizinkan melalui dashboard. Impor data nasional dan perubahan database tidak dijalankan dari workspace.',
  },
  {
    title: 'Metadata & Standar Data',
    text: 'Catat CRS, resolusi, NoData, metode resampling, periode, versi, sumber dan lisensi. Kelas tanah/tutupan lahan perlu mapping eksplisit; jangan normalisasi kode kategorikal.',
  },
  {
    title: 'FAQ',
    text: 'Draft disimpan di browser ini, bukan database. Peta demo bukan hasil ilmiah. PNG/PDF dapat bergantung pada kebijakan CORS basemap. Integrasi AI eksternal dan raster produksi belum tersedia.',
  },
];
export function HelpCenter() {
  return (
    <div className="gis-page">
      <div className="gis-eyebrow">DOKUMENTASI</div>
      <h1>Pusat bantuan</h1>
      <p className="gis-lead">Panduan praktis untuk menggunakan P4I Spatial Analytics.</p>
      <div className="gis-grid">
        {help.map((h) => (
          <article className="gis-card gis-card-body" key={h.title}>
            <BookOpen size={22} />
            <h3>{h.title}</h3>
            <p>{h.text}</p>
            <span className="gis-muted">Panduan lokal · PDF final menyusul</span>
          </article>
        ))}
      </div>
    </div>
  );
}
