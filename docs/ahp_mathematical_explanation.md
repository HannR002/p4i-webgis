# Mengapa Poligon Borneo Tidak Menjadi Hijau? 
*(Penjelasan Matematis AHP & WLC)*

Dokumen ini menguraikan secara transparan bagaimana algoritma pengambilan keputusan spasial kita bekerja di balik layar, khususnya ketika menanggapi input pengguna melalui antarmuka matriks AHP (Analytic Hierarchy Process).

## 1. Bukti Matematis dari Konfigurasi AHP Pengguna
Berdasarkan posisi *slider* AHP (Kiri vs Kanan) yang Anda tetapkan:
- **Bencana vs Kesuburan (1:4)** 👉 Kesuburan lebih dominan (Skor 1/4 atau 0.25)
- **Bencana vs Kepadatan (1:1)** 👉 Seimbang (Skor 1)
- **Kesuburan vs Kepadatan (4:1)** 👉 Kesuburan lebih dominan (Skor 4)

Ketika matriks 3x3 ini dimasukkan ke mesin *Eigenvector* (seperti yang divisualisasikan pada grafik Donut di panel), bobot relatif (*derived weights*) yang dihasilkan adalah:
*   **Kesuburan ($W_f$) = ~66.6% (0.666)**
*   **Bencana ($W_d$) = ~16.6% (0.166)**
*   **Kepadatan ($W_p$) = ~16.6% (0.166)**

## 2. Kalkulasi Weighted Linear Combination (WLC)
Sekarang, mari kita terapkan bobot tersebut pada skor *fallback mockup* untuk poligon **"Borneo / Kalimantan"**. Berdasarkan algoritma deterministik kita, nilai acak yang dihasilkan untuk wilayah ini adalah:
*   Skor Kesuburan = **4**
*   Skor Bencana = **1** *(Telah dibalik/inverted dari nilai asli 5 karena Bencana adalah Cost Factor)*
*   Skor Kepadatan = **3**

Rumus WLC menghitung rata-rata terbobot:
`Total = (Skor Kesuburan × W_f) + (Skor Bencana × W_d) + (Skor Kepadatan × W_p)`
`Total = (4 × 0.666) + (1 × 0.166) + (3 × 0.166)` 
`Total = 2.664 + 0.166 + 0.498 = 3.328`

## 3. Evaluasi Ambang Batas Klasifikasi (Threshold)
Sistem merender warna poligon berdasarkan klasifikasi mutlak:
*   Skor `>= 4.0` 👉 **Hijau (Sangat Layak)**
*   Skor `>= 3.0` 👉 **Kuning / Oranye Terang (#eab308)**
*   Skor `>= 2.0` 👉 **Oranye Asli (#f97316)**
*   Skor `< 2.0`  👉 **Merah (Tidak Layak)**

Nilai akhir `3.328` berada di rentang **Kuning**, sehingga wajar jika poligon tersebut belum berubah menjadi hijau.

## 4. Mengapa Tidak Bisa Mencapai Hijau?
Ini adalah pembuktian bahwa **AHP mencegah bias ekstrem**. 

Di sistem persentase primitif (sebelumnya), Anda bisa mengatur Kesuburan murni ke **100%**, sehingga nilai akhir akan menjadi `4.0` sempurna. 
Namun, di dalam AHP, bobot didistribusikan. Meskipun Kesuburan menang mutlak (9:1) atas kriteria lain, bobot tertingginya hanya mentok di sekitar **82%**. Sisa 18% akan dialokasikan ke Bencana (skor 1) dan Kepadatan (skor 3). Nilai-nilai kecil inilah yang akan selalu menyeret rata-rata gabungan **jatuh di bawah 4.0**.

Selama **Skor Kesuburan asli wilayah tersebut hanyalah 4** (bukan 5), maka secara matematis wilayah tersebut tidak akan pernah menyentuh rentang *Sangat Layak (Hijau)* selama AHP digunakan. Inilah fungsi utama *Expert System*: Memastikan pengambilan keputusan bersifat adil dan tidak dibutakan oleh satu parameter tunggal saja.
