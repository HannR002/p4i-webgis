# Dokumen Alur Proses Bisnis (Business Process) Terpadu
**Sistem: P4I Web-GIS Spatial Analytics Engine**
*Status Dokumen: As-Is (Sistem Berjalan Saat Ini - Fase 5)*

Dokumen ini memetakan seluruh siklus hidup proses bisnis (End-to-End Business Process) yang berjalan di dalam platform P4I Web-GIS saat ini, mulai dari akuisisi pengguna, manajemen data geospasial, hingga analitik dan pelaporan eksekutif.

---

## 1. Proses Akuisisi & Autentikasi Pengguna (User Journey)

### 1.1. Registrasi & Lead Generation
*   **Aktor:** Pengguna Umum / Calon Klien B2B.
*   **Proses:** Pengguna mengunjungi halaman pendaftaran atau mendarat di *Landing Page*. Bagi calon klien B2B (Perusahaan), mereka dapat mengisi formulir *Sales Leads* yang terintegrasi dengan modul pemasaran P4I.
*   **Teknologi:** Supabase Auth (Pendaftaran), PostgreSQL (Tabel `sales_leads`).

### 1.2. Autentikasi (Login) & Pengamanan Rute
*   **Aktor:** Pengguna Terdaftar, Admin P4I.
*   **Proses:** Pengguna memasukkan kredensial (Email/Password). Sistem memvalidasi identitas dan menerbitkan **JWT (JSON Web Token)**.
*   **Keamanan Ekstra (Middleware):** Setiap kali pengguna mengakses halaman berlisensi (seperti Dasbor Klien atau Modul *Upload*), **Next.js Edge Middleware** mencegat lalu lintas untuk memastikan *cookie/token* valid. Jika gagal, pengguna secara paksa dikembalikan ke halaman publik.

### 1.3. Tur Interaktif (Onboarding)
*   **Aktor:** Pengguna Baru (Klien).
*   **Proses:** Saat pengguna pertama kali mendarat di Portal Klien/Peta Utama, sistem mendeteksi ketiadaan log *Onboarding*. *Joyride Tour* otomatis muncul membimbing klien mengenali alat-alat utama: Panel AHP, Kontrol Peta, dan Tombol Ekspor.

---

## 2. Proses Tata Kelola Data Geospasial (Backend & Admin)

### 2.1. Unggah Proyek Spasial (Data Ingestion)
*   **Aktor:** Administrator P4I (Superadmin).
*   **Proses:** Admin masuk ke **Executive Dashboard** (`/admin/dashboard`) lalu mengakses menu Unggah (`/admin/upload`). Admin memasukkan dokumen *Shapefile* (SHP) atau format GeoJSON berisi peta tata ruang wilayah klien.
*   **Validasi:** Sistem API (Route Handlers) mengekstrak geometri, memvalidasi topologi, dan melakukan simplifikasi (*Topology Preserving Simplification*) untuk menghindari *bottleneck* RAM.

### 2.2. Injeksi & Hierarki Basis Data (PostGIS)
*   **Proses Internal:** Data yang lolos validasi disuntikkan ke dalam *Database Relasional* (Supabase).
*   **Struktur:**
    1.  Tabel `spatial_projects`: Menyimpan metadata proyek (Nama, Klien, Tanggal).
    2.  Tabel `vector_layers`: Menyimpan triliunan matriks poligon, garis, dan titik koordinat spasial (format tipe data `Geometry`).

### 2.3. Distribusi Hak Akses (Entitlements / RBAC)
*   **Aktor:** Administrator P4I.
*   **Proses:** Menggunakan arsitektur *Role-Based Access Control* (RBAC), Admin secara eksplisit mengaitkan (Mapping) Proyek Spasial tertentu kepada ID Pengguna Klien tertentu (Sistem 1-ke-1). Klien A dipastikan tidak bisa melihat peta rahasia milik Klien B (*Row Level Security/RLS* mulai bekerja di level basis data).

---

## 3. Proses Analitik Spasial (Client Portal)

### 3.1. Penjelajahan Pustaka Proyek
*   **Aktor:** Klien B2B / Pengguna Akhir.
*   **Proses:** Setelah *login*, klien diarahkan ke **P4I Portal Klien**. Di sini mereka melihat *Project Library* (Pustaka Proyek). Daftar proyek ini disajikan aman berdasarkan lisensi akses mereka.
*   **Ekosistem Terintegrasi:** Klien juga dapat melihat **Ecosystem Switcher** (Tombol Grid 9-Titik) di *Header* yang memungkinkan *Single Sign-On* (SSO) pindah-silang ke platform lain (P4I Journal OJS & P4I Academy) tanpa *login* ulang.

### 3.2. Rendering Peta (GIS Viewer)
*   **Aktor:** Klien B2B.
*   **Proses:** Klien mengklik salah satu Proyek. Sistem (`SpatialMap.tsx`) mengambil data GeoJSON dari basis data dan merendernya di atas kanvas peta (Leaflet.js / OpenStreetMap). 

### 3.3. Simulasi Sistem Pendukung Keputusan (AHP WLC)
*   **Aktor:** Klien B2B (Eksekutif/Analis).
*   **Proses:** Klien berinteraksi dengan **Simulator Bobot AHP** (Analytic Hierarchy Process) di *Floating Panel*. Mereka menggeser tuas persentase untuk indikator geospasial:
    *   Bobot Bencana Alam
    *   Bobot Kesuburan Tanah
    *   Bobot Kepadatan Penduduk
    (Kalkulasi wajib berjumlah 100% valid).
*   **Reaktivitas Choropleth (Zero-Latency):** 
    Sistem mengeksekusi algoritma *Weighted Linear Combination* (WLC) langsung di mesin *browser* klien. Peta bereaksi secara *Real-Time*, mengubah warna poligon GeoJSON (Merah, Oranye, Kuning, Hijau) untuk mencerminkan Kelayakan Tata Ruang *detik itu juga*.

---

## 4. Proses Pelaporan & Audit (Executive Export)

### 4.1. Pembuatan Laporan Cetak (Export)
*   **Aktor:** Klien B2B.
*   **Proses:** Setelah menemukan rumusan tata ruang yang ideal di Simulator AHP, Klien menekan tombol "Ekspor Ringkasan (PDF)".
*   **Koreografi Dual-Capture:**
    1. Sistem secara tersembunyi mengambil tangkapan layar Resolusi Tinggi dari *Donut Chart Recharts* (Grafik AHP) tanpa panel samping.
    2. Sistem memotret Kanvas Peta (Leaflet) bebas halangan.
    3. Merakit kedua gambar tersebut dengan kop surat berlogo, detail proyek, dan koefisien rumusan (jsPDF), menjadi Laporan Eksekutif PDF siap presentasi.

### 4.2. Pencatatan Jejak Audit (Audit Trail Logging)
*   **Sistem Internal:** Setiap unduhan laporan (Gambar/PDF) dipantau oleh sistem keamanan. API menembak *endpoint* unduhan yang mewajibkan otentikasi (JWT Token). Jika valid, sistem merekam sejarah aksi ke dalam tabel `download_history` sebagai bukti *Audit Trail* penggunaan proyek.
*   Riwayat unduhan ini kemudian dapat dilihat kembali oleh klien di Dasbor Portal mereka.

---

> [!NOTE]  
> **Transisi Fase Berikutnya:** 
> Saat ini tim arsitek tengah merancang pembaruan masa depan untuk memigrasikan *Engine Rendering* menuju **Vector Tiles (MVT)** guna mengatasi peta skala gigabyte, transisi sistem B2B Multi-Tenancy (Organisasi berkelompok), dan implementasi **Spatial-to-Text AI Recommender**.
