# Rencana Implementasi AHP-SMCE (Spatial Multi-Criteria Evaluation) Engine

Dokumen ini berisi analisis teknis dan cetak biru arsitektur untuk memigrasikan input "Slider Bobot Manual" saat ini menjadi sebuah **Mesin Kalkulasi AHP Sejati (True AHP Engine)** berbasis Matriks Perbandingan Berpasangan (*Pairwise Comparison Matrix*) beserta validasi *Consistency Ratio* (CR), sesuai standar akademis Tata Ruang.

## Analisis Kelayakan & Arsitektur

Secara absolut, **KITA SANGAT BISA** mengaplikasikan matematika ini ke dalam sistem React/Next.js kita! Bahkan, ini akan mengubah aplikasi kita dari sekadar "Alat Visualisasi" menjadi **"Sistem Pakar Pengambil Keputusan (Expert System)"** berskala Enterprise.

Berikut adalah analisis penjabaran dari dokumen Anda ke dalam bentuk arsitektur perangkat lunak:

1. **Pemodelan Spasial WLC dengan Faktor & Pembatas (Constraints)**
   - Saat ini rumus kita memukul rata semua parameter sebagai "Benefit".
   - *Rencana Modifikasi:* Kita akan mengubah fungsi `calculateSuitability` di `SpatialMap.tsx` untuk mengenali *Cost Factor* (Kerugian: misalnya Bencana). Skor Cost akan di-inversi (Skor Maksimal 5 - Skor Asli + 1). Kita juga akan menambahkan parameter pengali Boolean (0 atau 1) untuk *Constraint* (Kawasan Terlarang).

2. **Mesin Kalkulasi Matematika AHP (Eigenvector & CR)**
   - Algoritma rumit seperti normalisasi matriks dan penghitungan $\lambda_{max}$ tidak boleh disatukan dengan UI.
   - *Rencana Eksekusi:* Kita akan membuat file khusus `utils/ahpCalculator.ts`. File ini berisi kelas/fungsi murni (Pure Functions) yang menerima *input* matriks 3x3 dan mengembalikan objek berisi:
     - `weights` (Bobot terhitung)
     - `cr` (Consistency Ratio)
     - `isValid` (Boolean: true jika CR <= 0.1)

3. **Perombakan UI Panel AHP**
   - *Slider* persentase langsung (10%, 40%, 50%) menyalahi kaidah AHP Saaty.
   - *Rencana Eksekusi:* Panel `AhpSimulatorPanel.tsx` akan dirombak. Pengguna tidak lagi mengisi bobot, melainkan mengisi **Skala Kepentingan Berpasangan (1-9)**.
   - Contoh UI: `[Bencana] <--- 3 ---> [Kesuburan]` (Artinya Bencana 3x lebih penting dari Kesuburan).
   - Akan ada peringatan teks (Alert) berkedip MERAH jika nilai $CR > 10\%$, memperingatkan pengguna bahwa logika prioritas mereka tidak konsisten.

## Proposed Changes

### 1. Engine Matematika AHP
#### [NEW] `utils/ahpCalculator.ts`
- Membuat fungsi `calculateAHP(matrix: number[][])`
- Logika: 
  - Kalkulasi *Column Sum*
  - Normalisasi Matriks (Membagi sel dengan *Column Sum*)
  - Kalkulasi *Eigenvector/Priority Vector* (Rata-rata baris matriks ternormalisasi)
  - Perhitungan *Principal Eigenvalue* ($\lambda_{max}$)
  - Kalkulasi CI (Consistency Index) dan rasio CR menggunakan konstanta *Random Index* (RI) Saaty.

### 2. State Management (Zustand)
#### [MODIFY] `store/useMapStore.ts`
- Menghapus properti `ahpWeights` yang diisi manual.
- Menggantinya dengan:
  - `pairwiseMatrix`: Array 2D (Matriks 3x3).
  - `derivedWeights`: Hasil kalkulasi dari matriks.
  - `consistencyRatio`: Menyimpan nilai persentase CR.
  - `isConsistent`: Boolean untuk validasi.

### 3. UI Panel Interaktif (Pairwise Input)
#### [MODIFY] `components/AhpSimulatorPanel.tsx`
- Mengganti komponen *slider* linier dengan UI "Perbandingan Berpasangan".
  - Baris 1: Bencana vs Kesuburan (Skala 1/9 hingga 9)
  - Baris 2: Bencana vs Kepadatan (Skala 1/9 hingga 9)
  - Baris 3: Kesuburan vs Kepadatan (Skala 1/9 hingga 9)
- Menampilkan grafik Donut Recharts berdasarkan `derivedWeights`.
- Menambahkan **Badge Indikator Konsistensi** (Hijau jika CR <= 10%, Merah jika CR > 10%). Peta GeoJSON **HANYA** akan diperbarui jika CR Valid.

### 4. Peta Spasial (WLC & Constraint Logic)
#### [MODIFY] `components/SpatialMap.tsx`
- Memperbaiki rumus `totalScore`. 
- Kriteria Bencana akan direkayasa sebagai *Cost Parameter* menggunakan logika inverse `(6 - skorBencana)` agar semakin tinggi bencananya, semakin rendah kesesuaiannya (Merah).
- Peta disinkronisasikan untuk hanya mengkonsumsi bobot jika state `isConsistent === true`.

## Open Questions & Persetujuan

1. **UX Input Matriks:** Apakah Anda setuju menggunakan UI *Slider* dua arah (Bi-directional Slider) untuk input perbandingan berpasangan? (Kiri condong ke Kriteria A, Kanan condong ke Kriteria B, Tengah = 1 Sama Penting). Ini adalah standar UX terbaik agar pengguna tidak pusing melihat angka desimal (1/9, 1/3, dst).
2. **Pembatas (Constraint):** Apakah kita perlu memalsukan (Mockup) satu layer geometri yang bertindak sebagai *Constraint* absolut (nilai 0)? (Misalnya kita paksa poligon tertentu menjadi "Kawasan Hutan Lindung" sehingga akan selalu berwarna Merah/Hitam di peta berapapun bobot AHP-nya).

Mohon persetujuan Anda atas rancangan sistem pakar matematis ini sebelum saya mengeksekusi penulisan algoritma `ahpCalculator.ts`!
