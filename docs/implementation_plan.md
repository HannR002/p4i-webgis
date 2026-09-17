# Rencana Perombakan UI/UX Enterprise (P4I Ecosystem)

Dokumen ini merinci analisis teknis dan rencana eksekusi untuk mengubah estetika MVP Web-GIS P4I menjadi aplikasi berskala Enterprise tingkat tinggi dengan nuansa *Dark Theme*, animasi halus, dan pendaratan interaktif (3D Globe).

## User Review Required

> [!WARNING]
> Perombakan ini akan mengubah total estetika warna dan transisi animasi di seluruh aplikasi. Kita akan beralih dari tema "Biru Terang (Light Mode)" menjadi "Indigo/Violet Gelap (Dark Mode)". Mohon periksa analisis di bawah dan setujui rencana sebelum saya mulai mengoding.

## Analisis Ide Peningkatan UI Anda

Berikut adalah evaluasi arsitektural saya terhadap 8 gagasan brilian Anda:

1. **3D Globe di Landing Page:**
   - *Analisis:* Sangat setuju! Alih-alih menampilkan peta 2D yang membosankan di halaman depan, kita bisa merender bumi 3D menggunakan pustaka seperti `cobe` (sangat ringan, 5kb) atau `react-globe.gl` yang dipadukan dengan *Animated Gradient Header*. Ini akan memberikan kesan "Sistem Pemetaan Global" berteknologi tinggi di detik pertama pengguna membuka web.
2. **Dark Theme Peta & UI:**
   - *Analisis:* Mutlak diperlukan. *Basemap* OpenStreetMap bawaan terlalu terang dan kontrasnya bertabrakan dengan warna poligon Choropleth kita. Kita akan mengganti *TileLayer* Leaflet ke versi *Dark Matter* (CartoDB) sehingga poligon warna AHP akan terlihat menyala seperti neon di kegelapan.
3. **Animated Gradient Background:**
   - *Analisis:* Mudah dicapai murni menggunakan Tailwind CSS *Keyframes*. Tanpa membebani Javascript, kita bisa membuat gradasi violet-indigo yang bergeser secara perlahan di belakang *Landing Page*.
4. **Glassmorphism Tebal & Shadow:**
   - *Analisis:* Panel yang ada saat ini terlalu transparan. Kita akan memodifikasinya menggunakan lapisan `backdrop-blur-xl bg-slate-900/60 border border-slate-700/50 shadow-2xl` untuk menciptakan kedalaman spasial yang absolut.
5. **Micro-animations (framer-motion):**
   - *Analisis:* Pilihan pustaka yang sempurna. Kita akan menginstal `framer-motion` untuk mengatur transisi saat panel dibuka, *tooltip* muncul, atau saat poligon merender ulang nilainya.
6. **Loading Skeleton:**
   - *Analisis:* *Spinner* memutar sudah usang. Kita akan membuat *Skeleton UI* berdenyut dengan gradien *shimmer* yang menyerupai bentuk panel asli sehingga pengguna tidak merasa ada "waktu tunggu kosong".
7. **Palette Upgrade (Biru -> Indigo/Violet):**
   - *Analisis:* Warna biru generik terlalu mirip dengan aplikasi pemerintahan konvensional. Indigo/Violet (`indigo-500` ke `purple-600`) sering diasosiasikan dengan "Kecerdasan Buatan (AI) dan Inovasi". Ini akan menjadi *branding* baru kita.
8. **Legend Choropleth & Collapsible Sidebar:**
   - *Analisis:* Legenda adalah nyawa peta tematik. Kita akan membuat panel khusus di pojok kanan bawah peta. Sidebar yang *collapsible* (bisa disembunyikan/ditarik) sangat cocok dipadukan dengan *Framer Motion* untuk mengatasi layar kecil (Responsif Mobile).

## Proposed Changes

### 1. Struktur Folder (Pemisahan Landing Page & Portal)
Kita akan membebaskan `app/page.tsx` dari tugas merender Peta GIS, dan menjadikannya murni *Landing Page* komersial. Peta akan dipindahkan ke `app/map/page.tsx` atau `app/portal`.

#### [MODIFY] `app/page.tsx`
- Menghapus komponen `SpatialMap` dari halaman utama.
- Menambahkan **3D Globe** (via `cobe` atau pustaka interaktif ringan lainnya).
- Menambahkan *Hero Section* (Judul, Subjudul, Animasi Teks) dengan gradien Indigo/Violet.
- Tombol *Call to Action* "Masuk ke Peta / Coba Platform".

#### [NEW] `app/map/page.tsx`
- Akan berisi kode `SpatialMap` dan `FloatingPanel` yang dipindahkan dari `app/page.tsx` sebelumnya.

### 2. Estetika Peta (Map Engine)
#### [MODIFY] `components/SpatialMap.tsx`
- Mengganti URL `TileLayer` dari `openstreetmap.org` (Terang) menjadi `CartoDB Dark Matter` (Gelap).
- Menginjeksi komponen Legenda Choropleth (Hijau = Sangat Layak, Merah = Tidak Layak) yang ditempel absolut di atas peta.

### 3. Glassmorphism & Framer Motion
#### [MODIFY] `components/FloatingPanel.tsx`
- Mengubah *styling* panel ke mode *Dark Glassmorphism*.
- Membungkus komponen dengan `<motion.div>` agar panel muncul dari luar layar dengan efek pegas (*spring animation*).
- Menambahkan tombol "Tutup/Buka" (Collapsible) di pinggiran panel.

### 4. Skema Warna & Konfigurasi
#### [MODIFY] `tailwind.config.ts`
- Menambahkan kustomisasi *keyframes* animasi gradien yang berjalan perlahan (untuk *background header*).

## Open Questions

1. **Dependensi Baru:** Rencana ini membutuhkan instalasi dua pustaka (library) utama yaitu `framer-motion` (untuk animasi) dan `cobe` (untuk bola dunia 3D super ringan). Apakah Anda menyetujui instalasi ini?
2. **Rute Peta:** Jika `app/page.tsx` berubah menjadi *Landing Page*, apakah Anda ingin peta utamanya diletakkan di rute `/map`, atau kita arahkan ke `/portal` yang sudah ada? 

Silakan beri ulasan/persetujuan Anda pada dokumen ini, dan kita akan mulai mengoding!
