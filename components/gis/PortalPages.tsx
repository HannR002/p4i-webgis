'use client';
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight,
  Map,
  Search,
  Layers,
  Database,
  Sparkles,
  BookOpen,
  Globe2,
  SlidersHorizontal,
  RotateCcw,
  ShieldCheck,
  CircleHelp,
} from 'lucide-react';
import { WEBMAPS } from '../../lib/gis/catalog';
import type { Dataset } from '../../lib/gis/contracts';
import {
  filterDatasets,
  filterWebmaps,
  searchText,
  statusLabels,
  webmapStatus,
  type Webmap,
} from '../../lib/gis/presentation';
import { useGisCatalog } from './useGisCatalog';
export function DataModeBanner() {
  const { data, error, mutate } = useGisCatalog();
  return (
    <div
      className={`gis-mode ${data?.mode === 'demo' ? 'demo' : ''}`}
      role={error ? 'alert' : 'status'}
    >
      <ShieldCheck size={19} aria-hidden="true" />
      <span>
        {error
          ? 'Katalog tidak dapat dimuat.'
          : data?.mode === 'demo'
            ? 'MODE DEMO · Data sintetik untuk eksplorasi. Bukan data resmi atau hasil ilmiah.'
            : data
              ? 'Integrasi data nyata belum tersedia. Pratinjau contoh tetap diberi label demo.'
              : 'Memuat katalog…'}
      </span>
      {error && (
        <button className="gis-button secondary" onClick={() => void mutate()}>
          Coba lagi
        </button>
      )}
    </div>
  );
}
function Preview({
  map,
  priority = false,
}: {
  map: Webmap;
  priority?: boolean;
}) {
  return (
    <div className="gis-map-thumbnail">
      <Image
        src={`/gis/previews/${map.id}.png`}
        width={960}
        height={540}
        alt={`Pratinjau ${map.title} dengan layer sintetik P4I`}
        unoptimized
        preload={priority}
      />
      <span className="gis-preview-label">PRATINJAU DEMO</span>
    </div>
  );
}
export function PortalHome() {
  const { data } = useGisCatalog();
  return (
    <div className="gis-page">
      <section className="gis-hero">
        <div>
          <div className="gis-eyebrow">GEOPORTAL P4I · YAYASAN P4I</div>
          <h1>
            Jelajahi wilayah.
            <br />
            <em>Temukan perspektif.</em>
          </h1>
          <p>
            Data, peta, dan analisis spasial dalam satu ruang kerja. Mulai dari
            peta tematik, kenali sumber datanya, lalu susun kajian Anda.
          </p>
          <form
            action="/spatial/webmap"
            className="gis-home-search"
            role="search"
          >
            <Search size={20} aria-hidden="true" />
            <label className="gis-sr-only" htmlFor="home-search">
              Cari peta tematik
            </label>
            <input
              id="home-search"
              name="q"
              placeholder="Cari curah hujan, tanah, batas wilayah…"
              maxLength={200}
            />
            <button className="gis-button" type="submit">
              Cari peta
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </form>
          <Link className="gis-text-link" href="/spatial/viewer">
            Buka Map Workspace
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <figure className="gis-hero-preview">
          <Preview map={WEBMAPS[1]} priority />
          <figcaption>
            <span>
              <Map size={17} aria-hidden="true" />
              Kajian Kerentanan Banjir
            </span>
            <small>Cuplikan workspace · layer sintetik</small>
          </figcaption>
        </figure>
      </section>
      <DataModeBanner />
      <dl className="gis-stat-strip">
        <div>
          <dt>Webmap tematik</dt>
          <dd>
            {WEBMAPS.length}
            <small>konfigurasi contoh</small>
          </dd>
        </div>
        <div>
          <dt>Dataset katalog</dt>
          <dd>
            {data ? data.datasets.length : '—'}
            <small>sumber & metadata</small>
          </dd>
        </div>
        <div>
          <dt>Ruang kerja Anda</dt>
          <dd>
            <Layers size={23} aria-hidden="true" />
            <small>draft lokal · undo / redo</small>
          </dd>
        </div>
      </dl>
      <div className="gis-section-heading">
        <div>
          <span className="gis-eyebrow">DARI DATA KE KEPUTUSAN</span>
          <h2>Mulai eksplorasi Anda</h2>
        </div>
      </div>
      <div className="gis-grid four">
        {[
          {
            title: 'Webmap',
            text: 'Eksplorasi peta tematik dan konteks wilayah.',
            href: '/spatial/webmap',
            icon: Map,
          },
          {
            title: 'Data & metadata',
            text: 'Periksa sumber, periode, resolusi dan lisensi.',
            href: '/spatial/data',
            icon: Database,
          },
          {
            title: 'AI GIS Copilot',
            text: 'Susun konfigurasi peta dari instruksi Anda.',
            href: '/spatial/ai',
            icon: Sparkles,
          },
          {
            title: 'Pusat bantuan',
            text: 'Panduan peta, analisis dan ekspor.',
            href: '/spatial/help',
            icon: BookOpen,
          },
        ].map(({ title, text, href, icon: Icon }, index) => (
          <Link key={href} href={href} className="gis-card gis-shortcut">
            <span className="gis-shortcut-icon">
              <Icon size={23} aria-hidden="true" />
            </span>
            <small>0{index + 1}</small>
            <h3>{title}</h3>
            <p>{text}</p>
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        ))}
      </div>
      <div className="gis-section-heading">
        <div>
          <span className="gis-eyebrow">KOLEKSI PETA</span>
          <h2>Webmap pilihan</h2>
        </div>
        <Link className="gis-text-link" href="/spatial/webmap">
          Lihat semua
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
      <WebmapCards maps={WEBMAPS.slice(0, 3)} />
      <div className="gis-get-started">
        <div>
          <BookOpen size={24} aria-hidden="true" />
          <h2>Pertama kali menggunakan geoportal?</h2>
          <p>
            Pelajari cara memilih data, membaca metadata, dan menyimpan peta.
          </p>
        </div>
        <Link className="gis-button secondary" href="/spatial/help">
          Baca panduan
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
function CatalogSkeleton() {
  return (
    <div
      className="gis-grid"
      role="status"
      aria-busy="true"
      aria-label="Memuat kartu katalog"
    >
      {[1, 2, 3].map((n) => (
        <div className="gis-skeleton" key={n} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}
function EmptyCatalog({ reset }: { reset: () => void }) {
  return (
    <div className="gis-empty">
      <Search size={28} aria-hidden="true" />
      <h2>Tidak ada hasil yang cocok</h2>
      <p>Coba kata kunci lain atau hapus filter yang dipilih.</p>
      <button className="gis-button secondary" onClick={reset}>
        <RotateCcw size={16} aria-hidden="true" />
        Reset filter
      </button>
    </div>
  );
}
function WebmapCards({
  maps,
  headingLevel = 3,
}: {
  maps: readonly Webmap[];
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const { data, error } = useGisCatalog();
  if (!data && !error) return <CatalogSkeleton />;
  if (!data) return null;
  return (
    <div className="gis-grid">
      {maps.map((map) => {
        const status = webmapStatus(map, data.datasets);
        return (
          <article className="gis-card gis-webmap" key={map.id}>
            <Preview map={map} />
            <div className="gis-card-body">
              <div className="gis-card-meta">
                <span>{map.category}</span>
                <span>
                  <Globe2 size={13} aria-hidden="true" />
                  Publik
                </span>
              </div>
              <Heading>{map.title}</Heading>
              <p>{map.description}</p>
              <div className="gis-chips">
                <span className={`gis-tag ${status}`}>
                  {statusLabels[status]}
                </span>
                <span className="gis-tag neutral">
                  {map.datasets.length} layer
                </span>
              </div>
              <dl className="gis-card-facts">
                <div>
                  <dt>Sumber</dt>
                  <dd>Fixture sintetik P4I</dd>
                </div>
                <div>
                  <dt>Versi</dt>
                  <dd>demo-v1</dd>
                </div>
              </dl>
              {status !== 'unavailable' ? (
                <Link
                  className="gis-card-link"
                  aria-label={`Lihat Peta ${map.title}`}
                  href={`/spatial/viewer?webmap=${map.id}`}
                >
                  Lihat Peta
                  <ArrowRight size={17} aria-hidden="true" />
                </Link>
              ) : (
                <span className="gis-unavailable-link">
                  Dataset belum aktif
                </span>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
export function WebmapCatalog({
  initialQuery = '',
}: {
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState('all');
  const { data } = useGisCatalog();
  const items = filterWebmaps(query, category);
  function reset() {
    setQuery('');
    setCategory('all');
  }
  return (
    <div className="gis-page">
      <div className="gis-page-heading">
        <div>
          <div className="gis-eyebrow">KATALOG PETA</div>
          <h1>Webmap</h1>
          <p className="gis-lead">
            Peta tematik sebagai titik awal eksplorasi dan kajian wilayah Anda.
          </p>
        </div>
        <Link className="gis-button secondary" href="/spatial/viewer">
          <Layers size={17} aria-hidden="true" />
          Map Workspace
        </Link>
      </div>
      <DataModeBanner />
      <div className="gis-filters">
        <label className="gis-filter-search">
          <span>Cari webmap</span>
          <div className="gis-search">
            <Search size={18} aria-hidden="true" />
            <input
              aria-label="Cari webmap"
              value={query}
              maxLength={200}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Judul, tema, atau kata kunci…"
            />
          </div>
        </label>
        <label>
          <span>Kategori peta</span>
          <select
            aria-label="Kategori peta"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="all">Semua kategori</option>
            {[...new Set(WEBMAPS.map((m) => m.category))].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <button
          className="gis-button secondary"
          onClick={reset}
          disabled={!query && category === 'all'}
        >
          <RotateCcw size={16} aria-hidden="true" />
          Reset filter
        </button>
      </div>
      <div className="gis-results-heading">
        <p role="status">
          {data ? `${items.length} webmap ditemukan` : 'Memuat webmap…'}
        </p>
        <span className="gis-muted">Pratinjau dari renderer peta P4I</span>
      </div>
      {items.length ? (
        <WebmapCards maps={items} headingLevel={2} />
      ) : (
        <EmptyCatalog reset={reset} />
      )}
    </div>
  );
}
export function DatasetCard({ dataset: d }: { dataset: Dataset }) {
  return (
    <article className="gis-card gis-card-body gis-dataset-card">
      <div className="gis-dataset-icon">
        {d.type === 'raster' ? (
          <Layers size={22} aria-hidden="true" />
        ) : (
          <Map size={22} aria-hidden="true" />
        )}
        <span>{d.type === 'raster' ? 'RASTER' : 'VEKTOR'}</span>
      </div>
      <div className="gis-card-meta">
        <span>{d.category}</span>
        <span>{d.accessTier === 'public' ? 'Publik' : 'Terbatas'}</span>
      </div>
      <h2>{d.title}</h2>
      <p>{d.description}</p>
      <div className="gis-chips">
        <span className={`gis-tag ${d.status}`}>{statusLabels[d.status]}</span>
        <span className="gis-tag neutral">{d.crs}</span>
      </div>
      <dl className="gis-metadata">
        <dt>Sumber</dt>
        <dd>{d.source}</dd>
        <dt>Versi</dt>
        <dd>{d.version}</dd>
        <dt>Resolusi</dt>
        <dd>
          {d.raster
            ? `${d.raster.resolution.x} × ${d.raster.resolution.y} ${d.raster.resolution.unit}`
            : 'Geometri vektor'}
        </dd>
        <dt>Periode</dt>
        <dd>
          {d.raster
            ? `${d.raster.period.start} — ${d.raster.period.end}`
            : 'Lihat metadata sumber'}
        </dd>
        <dt>Lisensi</dt>
        <dd>{d.license}</dd>
        <dt>Pembaruan</dt>
        <dd>{d.updatedAt}</dd>
      </dl>
      <details className="gis-metadata-details">
        <summary>Metadata lengkap</summary>
        <dl className="gis-metadata">
          <dt>Format</dt>
          <dd>{d.formats.join(', ')}</dd>
          <dt>Bounds</dt>
          <dd>{d.bounds.join(', ')}</dd>
          <dt>Provider</dt>
          <dd>{d.provider}</dd>
        </dl>
        <p>{d.provenance}</p>
        {d.raster && (
          <>
            <p>
              Band:{' '}
              {d.raster.bands.map((b) => `${b.id} (${b.unit})`).join(', ')}
            </p>
            <p>
              NoData: {d.raster.noData.meaning} · Resampling:{' '}
              {d.raster.resampling}
            </p>
          </>
        )}
      </details>
      {d.status !== 'unavailable' ? (
        <Link
          className="gis-card-link"
          href={`/spatial/viewer?dataset=${d.id}`}
        >
          Tinjau {d.title}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      ) : (
        <span className="gis-unavailable-link">
          Integrasi dataset belum tersedia
        </span>
      )}
      <small className="gis-muted">
        {d.type === 'vector' && d.status === 'demo'
          ? 'Contoh GeoJSON dapat diunduh dari workspace.'
          : 'Raster sumber belum tersedia untuk diunduh.'}
      </small>
    </article>
  );
}
export function DatasetCatalog() {
  const { data, error } = useGisCatalog();
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const items = filterDatasets(data?.datasets ?? [], {
    query,
    type,
    category,
    status,
  });
  function reset() {
    setQuery('');
    setType('all');
    setCategory('all');
    setStatus('all');
  }
  return (
    <div className="gis-page">
      <div className="gis-eyebrow">KATALOG DATA GEOSPASIAL</div>
      <h1>Data & metadata</h1>
      <p className="gis-lead">
        Kenali sumber, cakupan, dan batas penggunaan sebelum menyusun peta.
      </p>
      <DataModeBanner />
      <div className="gis-filters gis-data-filters">
        <label className="gis-filter-search">
          <span>Cari dataset</span>
          <div className="gis-search">
            <Search size={18} aria-hidden="true" />
            <input
              aria-label="Cari dataset"
              value={query}
              maxLength={200}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Judul, sumber, atau kata kunci…"
            />
          </div>
        </label>
        <label>
          <span>Jenis dataset</span>
          <select
            aria-label="Jenis dataset"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="all">Semua jenis</option>
            <option value="vector">Vektor</option>
            <option value="raster">Raster</option>
          </select>
        </label>
        <label>
          <span>Kategori data</span>
          <select
            aria-label="Kategori data"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="all">Semua kategori</option>
            {[...new Set(data?.datasets.map((d) => d.category))].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Status data</span>
          <select
            aria-label="Status data"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">Semua status</option>
            <option value="demo">Demo sintetik</option>
            <option value="available">Data tersedia</option>
            <option value="unavailable">Belum tersedia</option>
          </select>
        </label>
      </div>
      <div className="gis-results-heading">
        <p role="status">
          {data
            ? `${items.length} dataset ditemukan`
            : error
              ? 'Katalog belum dapat diakses'
              : 'Memuat dataset…'}
        </p>
        <button
          className="gis-text-link"
          onClick={reset}
          disabled={
            !query && type === 'all' && category === 'all' && status === 'all'
          }
        >
          <SlidersHorizontal size={16} aria-hidden="true" />
          Reset filter
        </button>
      </div>
      {!data && !error ? (
        <CatalogSkeleton />
      ) : data && !items.length ? (
        <EmptyCatalog reset={reset} />
      ) : (
        <div className="gis-grid">
          {items.map((d) => (
            <DatasetCard key={d.id} dataset={d} />
          ))}
        </div>
      )}
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
  const [query, setQuery] = useState('');
  const items = help.filter((h) =>
    searchText(`${h.title} ${h.text}`).includes(searchText(query)),
  );
  return (
    <div className="gis-page">
      <div className="gis-eyebrow">PANDUAN & DOKUMENTASI</div>
      <h1>Pusat bantuan</h1>
      <p className="gis-lead">
        Dari membuka peta pertama hingga menyimpan dan membagikan hasil kajian.
      </p>
      <section className="gis-quickstart" aria-labelledby="quickstart-title">
        <div>
          <BookOpen size={24} aria-hidden="true" />
          <h2 id="quickstart-title">Mulai dalam tiga langkah</h2>
        </div>
        <ol>
          <li>
            <strong>Pilih peta</strong>
            <span>
              Buka katalog Webmap dan pilih tema yang ingin dijelajahi.
            </span>
            <Link href="/spatial/webmap">Jelajahi Webmap →</Link>
          </li>
          <li>
            <strong>Kenali datanya</strong>
            <span>
              Periksa sumber, resolusi, periode dan label demo sebelum analisis.
            </span>
            <Link href="/spatial/data">Baca metadata →</Link>
          </li>
          <li>
            <strong>Simpan kajian</strong>
            <span>
              Susun layer, simpan draft di browser, atau ekspor resep, PNG dan
              PDF.
            </span>
            <Link href="/spatial/viewer">Buka workspace →</Link>
          </li>
        </ol>
      </section>
      <label className="gis-search gis-help-search">
        <Search size={18} aria-hidden="true" />
        <input
          aria-label="Cari panduan"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari bantuan tentang analisis, ekspor, metadata…"
        />
      </label>
      <p className="gis-results-heading" role="status">
        {items.length} panduan
      </p>
      <div className="gis-help-list">
        {items.map((h) => (
          <details key={h.title} className="gis-card">
            <summary>
              <CircleHelp size={19} aria-hidden="true" />
              {h.title}
            </summary>
            <p>{h.text}</p>
          </details>
        ))}
      </div>
      {!items.length && <EmptyCatalog reset={() => setQuery('')} />}
      <div className="gis-keyboard-guide">
        <h2>Navigasi keyboard</h2>
        <p>
          <kbd>Tab</kbd> berpindah kontrol · <kbd>Enter</kbd> membuka tautan ·{' '}
          <kbd>Space</kbd> mengaktifkan tombol · <kbd>Esc</kbd> menutup menu
          mobile.
        </p>
        <p>
          Di workspace, tab panel menggunakan tombol panah, Home dan End.
          Fokuskan peta untuk menggeser dengan panah; inspeksi titik pusat
          tersedia tanpa klik peta.
        </p>
        <p>
          Draft disimpan hanya di browser ini. Menghapus data browser juga
          menghapus draft; ekspor resep JSON untuk cadangan.
        </p>
      </div>
    </div>
  );
}
