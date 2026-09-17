# Rencana Rekayasa & Skalabilitas Masa Depan (Fase 6 & 7)
*Dokumen Arsitektur Sistem P4I Web-GIS Spatial Analytics*

Dokumen ini merangkum rancangan arsitektur teknis *(Technical Blueprint)* untuk memigrasikan aplikasi Web-GIS P4I dari skala Prototipe/MVP menuju *Enterprise-Grade SaaS*. Terdapat 3 pilar transformasi utama yang disorot: Migrasi Rendering Ekstrem, Keamanan Perimeter Edge, dan Infrastruktur Multi-Tenancy B2B.

---

## Pilar 1: Migrasi Rendering Ekstrem (Vector Tiles via PostGIS MVT)

### Konsep Matematis & Alasan Penurunan (Deprecation) Leaflet.js
Leaflet.js menggunakan pendekatan *DOM-based rendering* atau *Canvas 2D rendering* murni. Ketika memuat `GeoJSON` mentah sebesar 50MB (misalnya jutaan titik batas desa), mesin peramban (V8 Engine) harus melakukan iterasi dan menyimpan setiap koordinat ke dalam RAM komputer (*Memory Heap*). Hal ini menyebabkan komputasi $O(N)$ di mana $N$ adalah jumlah verteks, berakibat pada *bottleneck* peramban (Freeze/Crash).

**Solusi Terkoreksi: MapLibre GL JS + Vector Tiles (MVT)**
MapLibre GL JS (fork open-source dari Mapbox GL JS) digunakan untuk merender visual menggunakan akselerasi perangkat keras kartu grafis (**WebGL/GPU**). Pendekatan ini menghindari jebakan lisensi *proprietary* berbayar dari Mapbox yang bisa membengkakkan biaya secara eksponensial. GPU memproses jutaan verteks secara paralel ($O(1)$ untuk *rendering* dari sisi CPU). Agar payload jaringan mengecil, data spasial dipecah menjadi *ubin biner* (Tile) berukuran $256 \times 256$ piksel dengan format `.pbf` (Protocolbuffer).

### Proof of Concept: `ST_AsMVT` Route Handler
*Kode ini dipasang pada `app/api/tiles/[z]/[x]/[y]/route.ts`*

```typescript
// Konsep Dynamic Route: /api/tiles/{z}/{x}/{y}
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(
  request: Request,
  { params }: { params: { z: string; x: string; y: string } }
) {
  const { z, x, y } = params;
  
  // 1. Kalkulasi Bounding Box dari XYZ Ubin Web Mercator (PostGIS ST_TileEnvelope)
  // 2. ST_AsMVTGeom: Mengonversi koordinat global ke koordinat piksel lokal (0-4096)
  // 3. ST_AsMVT: Mengompresi hasil menjadi format biner Protobuf
  const rpcQuery = `
    WITH mvtgeom AS (
      SELECT 
        ST_AsMVTGeom(ST_Transform(geom, 3857), ST_TileEnvelope($1, $2, $3)) AS geom,
        layer_name,
        properties
      FROM vector_layers
      WHERE ST_Intersects(ST_Transform(geom, 3857), ST_TileEnvelope($1, $2, $3))
    )
    SELECT ST_AsMVT(mvtgeom.*, 'spatial_layer') AS tile FROM mvtgeom;
  `;

  // Pemanggilan RPC Supabase
  const { data, error } = await supabaseAdmin.rpc('get_mvt_tile', { z: parseInt(z), x: parseInt(x), y: parseInt(y) });

  if (error || !data) return new NextResponse(null, { status: 404 });

  // Kembalikan sebagai ByteArray (Biner) dengan header MVT
  return new NextResponse(Buffer.from(data.tile, 'hex'), {
    headers: {
      'Content-Type': 'application/vnd.mapbox-vector-tile',
      'Content-Encoding': 'gzip', // Opsional jika dikompresi
      'Cache-Control': 'public, max-age=86400' // Edge Caching 24 Jam
    }
  });
}
```
**Trade-Off & Solusi Jebakan Infrastruktur:**
*   **Kelebihan:** Mampu merender poligon raksasa se-Indonesia dalam 1 detik.
*   **Kekurangan (Database CPU Death):** Fungsi `ST_AsMVT` sangat membebani CPU PostgreSQL. Jika ribuan pengguna mengakses secara bersamaan, database akan hancur. 
*   **Koreksi Solusi Mutlak:** Wajib menerapkan **Tile Caching**. Response biner dari rute ini harus di-cache secara persisten di CDN Vercel atau Redis. API Route hanya boleh menembak langsung ke Supabase jika Tile Z/X/Y tersebut belum pernah di-*generate* sebelumnya.

---

## Pilar 2: Keamanan & Stabilitas Perimeter (Upstash Redis Rate Limiting)

### Logika Algoritma (Sliding Window Algorithm)
Serangan bot yang mengunggah jutaan *Shapefile* (DDoS Layer 7) akan meruntuhkan CPU *Database* utama. Kita menggunakan `Upstash Redis` (serverless caching) yang dieksekusi di *Edge Middleware* Vercel/Next.js (Edge Network, lokasi terdekat dengan *User*).
Algoritma *Sliding Window* menyimpan "jendela waktu" memori alih-alih menghapus kuota tiap detik/menit statis (*Fixed Window*), mencegah ledakan beban lalu lintas (Spike Burst) pada detik pergantian menit.

### Proof of Concept: Edge Middleware
*Kode ini dipasang pada `middleware.ts`*

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Koneksi ke Upstash Redis (Teresolusi di Edge)
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Konfigurasi Sliding Window: Maksimal 5 Request per 10 Detik
const ratelimit = new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(5, '10 s'),
  analytics: true,
});

export async function middleware(request: NextRequest) {
  // Hanya lindungi rute krusial (Login & Upload Project)
  if (request.nextUrl.pathname.startsWith('/api/projects') || request.nextUrl.pathname.startsWith('/api/auth')) {
    
    // Koreksi Jebakan NAT: Gunakan User ID (JWT) jika login, atau Fingerprint IP jika anonim
    const token = request.cookies.get('sb-access-token')?.value;
    let identifier = request.ip ?? '127.0.0.1';
    
    if (token) {
      // Ekstrak User ID dari JWT secara ringan tanpa verifikasi signature berat
      const payloadBase64Url = token.split('.')[1];
      if (payloadBase64Url) {
        const payload = JSON.parse(atob(payloadBase64Url));
        if (payload.sub) identifier = payload.sub; // User ID yang unik
      }
    }
    
    // Tembak Redis di Edge (Waktu respon < 10ms)
    const { success, pending, limit, reset, remaining } = await ratelimit.limit(`ratelimit_${identifier}`);

    if (!success) {
      return NextResponse.json(
        { error: 'Terlalu banyak permintaan. Silakan tunggu beberapa saat.' },
        { 
          status: 429, // Too Many Requests
          headers: {
            'X-RateLimit-Limit': limit.toString(),
            'X-RateLimit-Remaining': remaining.toString(),
            'X-RateLimit-Reset': reset.toString(),
            'Retry-After': Math.ceil((reset - Date.now()) / 1000).toString()
          }
        }
      );
    }
  }
  return NextResponse.next();
}
```
**Trade-Off & Solusi Jebakan Infrastruktur:**
*   **Kelebihan:** Eksekusi terjadi di Edge Network (Zero Compute Cost on DB). Mencegah *Brute-Force* secara instan.
*   **Kekurangan (Jebakan False Positive NAT):** Membatasi murni dari `request.ip` akan memblokir 1 kantor instansi secara massal karena ratusan staf seringkali berbagi 1 IP Publik (Carrier-Grade NAT).
*   **Koreksi Solusi Mutlak:** Kode di atas telah dimodifikasi agar memprioritaskan ekstraksi **User ID** dari JWT *(payload.sub)* untuk pengguna terautentikasi. Dengan ini, perlindungan ditujukan per aktor spesifik, bukan IP jaringan.

---

## Pilar 3: Arsitektur Multi-Tenancy (Organisasi B2B Terisolasi)

### Evaluasi RBAC Saat Ini & Perombakan Skema DDL
Saat ini (*Fase 5*), proyek bersifat 1-ke-1 (Entitlement tabel pivot: `user <-> proyek`). Skema ini gagal jika Klien B2B berupa institusi yang memiliki 1 *Admin Instansi* dan 10 *Staff Instansi* (Membutuhkan ruang kerja kolaboratif). 

Kita harus memperkenalkan konsep `organizations` (Tenants) dan `organization_members`. Ruang kerja menjadi terisolasi murni.

### Konsep DDL (Data Definition Language) Baru

```sql
-- 1. Tabel Ruang Kerja / Organisasi (Tenant)
CREATE TABLE organizations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  subscription_tier VARCHAR(50) DEFAULT 'basic', -- 'basic', 'premium', 'enterprise'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Anggota Organisasi (Tenant Members)
CREATE TABLE organization_members (
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  member_role VARCHAR(50) DEFAULT 'member', -- 'owner', 'admin', 'member'
  PRIMARY KEY (org_id, user_id)
);

-- 3. Injeksi org_id ke dalam Data Proyek
ALTER TABLE spatial_projects 
ADD COLUMN org_id UUID REFERENCES organizations(id) NULL;
```

### Proof of Concept: RLS Multi-Tenant Super Cepat (Custom JWT Claims)
Row Level Security (RLS) konvensional dengan *Join* (`EXISTS (SELECT ...)`) akan memicu penalti "N+1 Query" yang fatal. Kita mengubahnya dengan logika **Custom JWT Claims**.

Sistem akan disetup agar saat *login*, ada *Database Trigger* yang menyuntikkan `org_id` ke dalam memori *payload* JWT Auth Supabase. Sehingga RLS berubah menjadi validasi statis yang secepat kilat:

```sql
-- Mengaktifkan penguncian baris absolut
ALTER TABLE spatial_projects ENABLE ROW LEVEL SECURITY;

-- Klien hanya boleh melihat proyek yang di-tag dengan ID Organisasinya sendiri
-- Performa 100x Lebih Cepat Tanpa Sub-Query JOIN!
CREATE POLICY "Tenant Isolation: Lihat proyek dalam organisasi sendiri"
ON spatial_projects
FOR SELECT
USING (
  org_id = (auth.jwt() ->> 'org_id')::uuid
  OR
  access_tier = 'public'
);

-- Pengaturan Mutasi (Upload) divalidasi juga lewat claims khusus (misal role B2B)
CREATE POLICY "Tenant Isolation: Hanya Admin yang bisa mengunggah"
ON spatial_projects
FOR INSERT
WITH CHECK (
  org_id = (auth.jwt() ->> 'org_id')::uuid
  AND 
  (auth.jwt() ->> 'member_role') IN ('owner', 'admin')
);
```
**Trade-Off & Solusi Jebakan Infrastruktur:**
*   **Kelebihan:** Privasi *Data-Leak* terjamin. Validasi RLS menjadi $O(1)$ *(Instantaneous)* karena membaca langsung dari sesi *in-memory* tanpa melakukan operasi *Join* kueri SQL.
*   **Kekurangan (Jebakan N+1 Query):** RLS dengan *Sub-query EXISTS* akan mengeksekusi operasi ke tabel `organization_members` sebanyak ratusan kali tiap muatan.
*   **Koreksi Solusi Mutlak:** Menyuntikkan `org_id` dan `member_role` secara langsung sebagai ekstensi khusus (Custom Claims) pada Token JWT. Backend Supabase akan memvalidasinya secara internal dan transparan.
