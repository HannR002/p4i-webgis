# P4I WebGIS — Laporan Implementasi Komprehensif Phase 01–09

**Tanggal:** 15 Oktober 2026, Asia/Jakarta. **Repository:** HannR002/p4i-webgis.
**Branch Phase 09:** `feat/production-readiness-phase09`, basis aktual Phase 08 `5e9d651`.

## 1. Kesimpulan teknis dan batas bukti

P4I Spatial Analytics memiliki workspace GIS yang berfungsi dan telah diuji lokal: geoportal,
MapRecipe/Leaflet, katalog, inspeksi raster, konfigurasi AHP/WLC, Copilot deterministik, komputasi
terkendali, ekspor dan workflow deliverable. Platform **belum siap melayani analisis komersial
nyata di produksi**. Data P4I, adapter raster/GEE dan LLM terotorisasi, reproduksi fondasi database,
persistensi job/deliverable, operasi hosting dan penerimaan manusia masih belum terverifikasi.

Laporan ini membedakan kode yang diperiksa, tes otomatis yang dijalankan, hasil historis dan
rancangan integrasi. Tidak ada hasil wawancara, survei pengguna, akurasi ilmiah, persetujuan reviewer
nyata, penerimaan Yayasan P4I, atau pengukuran lingkungan nyata yang direkayasa. Tes transport AI
menggunakan respons lokal, sedangkan raster DEMO mengembalikan nilai fixture yang benar-benar
dihitung. Nilai fixture tersebut bukan observasi geografis dunia nyata.

Tidak ada deployment, merge, migrasi produksi/staging eksternal, unggahan nasional, publikasi
klien nyata, registrasi/billing GEE atau panggilan LLM/GEE berbayar pada Phase 09. Konfigurasi
environment yang menyebut credential sebagai ready tidak membuktikan otorisasi komersial atau
akses aset. Tidak ada credential diuji melalui layanan analisis eksternal.

## 2. Latar belakang dan rumusan masalah sistem informasi

P4I Spatial Analytics merupakan vertikal GIS P4I Consultant untuk jasa konsultasi B2B/B2G.
Platform perlu menghubungkan penemuan data, pembuatan peta, konfigurasi analisis, pekerjaan analis,
review deliverable dan distribusi kepada klien berhak dalam alur yang dapat ditelusuri.

Rumusan masalah berikut berasal dari kebutuhan produk dan audit kode, **bukan temuan penelitian
lapangan**: bagaimana menyatukan konfigurasi/peta/hasil; memastikan provenance dan reproduksibilitas;
mengurangi risiko interpretasi data DEMO; membatasi akses lintas proyek; membatasi otonomi dan biaya
AI; serta menjaga integritas revisi dan otorisasi publikasi. Tujuan rekayasa adalah alur yang jelas,
terukur batasnya, dapat diuji dan tetap portabel antar penyedia backend.

Validasi metodologi ilmiah, grading/ranking metode dan status metodologi VALIDATED/UNDER_REVIEW
secara eksplisit di luar lingkup. Review deliverable oleh manusia tetap diperlukan untuk kelengkapan,
interpretasi yang dimaksud, otorisasi rilis dan kualitas profesional. Review itu tidak boleh diklaim
sebagai validasi ilmiah otomatis.

## 3. Evolusi arsitektur dan bukti setiap fase

Riwayat lokal membawa semua fase; keberadaan commit tidak berarti PR telah di-merge ke main.
Basis Phase 09 adalah branch Phase 08. PR dibuat bertumpuk untuk menjaga delta review. Bukti
historis tersimpan pada `docs/evidence/phase-01` sampai `phase-08`; hasil di tabel berikut tidak
diklaim sebagai pengujian ulang integrasi live pada Phase 09.

| Fase | Commit implementasi | Perubahan utama | Hasil tes aplikasi historis |
|---|---|---|---|
| 01 | `35f9848` | Rekonsiliasi workspace, stale response, layering, AHP, isolasi DEMO dan ekspor | 75 tes/17 file + lint/typecheck/build/browser |
| 02 | `45c15fd` | Geoportal Home/Webmap/Data/Help, preview aktual renderer, fokus/mobile | 81/19 + browser/responsif/Axe |
| 03 | `1d7e395` | Kontrak raster, native pixel, NoData, operasi lokal dan metadata ekspor | 123/22 + browser raster |
| 04 | `a2ad07b` | Konfigurasi analisis tervalidasi, draft lokal, bobot/scenario, provenance | 154/25 + browser konfigurasi |
| 05 | `cf3a39b` | AIProvider, registry immutable, plan/tool/output validation, atomic Undo | 188/28 + browser Copilot |
| 06 | `5a04e30` | Job, estimasi/batas sumber daya, approval snapshot, cancel/retry/usage | 209/30 + browser komputasi/ekspor |
| 07 | `4bae725` | Proyek konsultasi, revisi immutable, reviewer/publisher eksplisit, unduhan klien | 226/32 + browser deliverable |
| 08 | `f8c33ed` | Inventaris SQL, migration plan/gates, 008 hardening dan rehearsal PostgREST | 230/33 + 2 × 170 pemeriksaan database sintetis |
| 09 | branch laporan ini | Import/CRS aman, gerbang GEE, NoData ketat, seam AI, containment API, audit/UAT | 257/36 + browser dan production-mode smoke lokal |

Jumlah tes merupakan cakupan suite pada masing-masing fase, bukan nilai kualitas produk atau
akurasi analisis. Rehearsal database Phase 08 menggunakan fondasi sintetis yang ditandai; belum
merekonstruksi DDL live yang hilang. Tidak ada SQL baru pada Phase 09.

## 4. Status fitur aktual

Klasifikasi: IMPLEMENTED_AND_TESTED berarti fungsi yang disebut telah diuji dalam lingkup yang
ditulis; IMPLEMENTED_DEMO_ONLY berarti integrasi aplikasinya memakai fixture/persona/adaptor lokal;
INTERFACE_READY berarti kontrak/seam tersedia tanpa backend nyata; EXTERNAL_INTEGRATION_PENDING
memerlukan penyedia/data/izin; NOT_IMPLEMENTED belum mempunyai implementasi; BLOCKED mempunyai
prasyarat yang belum dapat dipenuhi. Satu subsistem dapat memiliki baris berbeda untuk UI dan backend.

| Fitur/aspek | Klasifikasi | Bukti dan batasan |
|---|---|---|
| Geoportal Home, Webmap, Data Catalog, Help | IMPLEMENTED_AND_TESTED | Navigasi/filter/metadata/preview/error/responsif; isi data aktif masih DEMO |
| Katalog dan raster P4I nyata | EXTERNAL_INTEGRATION_PENDING | Tidak ada data/metadata/grid/lisensi P4I terverifikasi yang diserahkan |
| Map Builder/SpatialMap/MapRecipe | IMPLEMENTED_AND_TESTED | Engine Leaflet yang sama, layer/order/opacity/style/AOI/draft/Undo/Redo; persistensi lokal |
| Pixel Inspector terhubung ke provider aktif | IMPLEMENTED_DEMO_ONLY | Sampel native fixture, band, unit, transform 4326/3857, NoData diuji |
| RasterProvider nyata | INTERFACE_READY | Kontrak async dan validator ada; registry/tile/sampling real belum terhubung |
| GIS Analysis Configuration | IMPLEMENTED_AND_TESTED | Runtime validation, versi, save/load/duplicate/delete, source snapshot; storage lokal |
| Matematika AHP/CR dan WLC | IMPLEMENTED_AND_TESTED | Perhitungan deterministik/validasi bobot; tanpa klaim akurasi ilmiah |
| GIS raster/geometry lokal | IMPLEMENTED_DEMO_ONLY | Native-center stats, klasifikasi/arithmetic/overlay titik, area/jarak/seleksi fixture; clip/mask descriptor |
| Flood UI/configuration/legacy graph | INTERFACE_READY | Empat kriteria eksperimental, graph Node/GEE; jalur nyata sengaja diblokir |
| Flood/GEE komersial | BLOCKED | Registrasi/terms/IAM/data dan adapter job governed belum tersedia |
| Copilot deterministik | IMPLEMENTED_DEMO_ONLY | Closed grammar, dataset/AOI dikenal, plan tervalidasi dan satu Undo; bukan LLM |
| Structured AIProvider seam | INTERFACE_READY | Transport injected diuji, output/usage dibatasi; tidak memilih vendor atau endpoint |
| LLM nyata | EXTERNAL_INTEGRATION_PENDING | Model, processing terms, credential terotorisasi, budget/usage durable belum ada |
| Controlled execution/cost approval | IMPLEMENTED_DEMO_ONLY | Job/estimate/hash/expiry/owner/current ACL/cancel/retry diuji lokal |
| Queue dan billing provider durable | NOT_IMPLEMENTED | Process-local job/usage tidak bertahan restart; tidak ada ledger biaya uang |
| Consulting deliverables/review/client release | IMPLEMENTED_DEMO_ONLY | Revisi/hash/permission/PDF/JSON berfungsi dalam DEVELOPMENT_SIMULATION |
| Official client publication | BLOCKED | Durable repository, identity/grants dan release authority nyata belum terintegrasi |
| Database rehearsal/PostgREST authorization | IMPLEMENTED_AND_TESTED | PostgreSQL/PostGIS/PostgREST nyata dalam container lokal sintetis Phase 08 |
| Reproduksi fresh schema Supabase | BLOCKED | DDL fondasi/trigger/view/owner/relationship live belum tersedia |
| RBAC/entitlement keputusan server | IMPLEMENTED_AND_TESTED | Token identity + stored role/disabled + entitlement; synthetic direct SQL/HTTP tests |
| Login/admin/B2B happy path live | EXTERNAL_INTEGRATION_PENDING | Tidak ada UAT akun staging nyata pada fase ini |
| PDF/PNG/JSON/Markdown export lokal | IMPLEMENTED_AND_TESTED | Browser mengunduh berkas nyata; keterbatasan CORS basemap/provider tetap berlaku |
| Import SHP/GeoJSON dry-run | IMPLEMENTED_AND_TESTED | Fixture projected SHP + DBF/PRJ dan GeoJSON ditransformasi; bukan dataset nasional |
| Hosting produksi/operational readiness | BLOCKED | Paket Hostinger/runtime/worker/backup/load/restore belum diuji |
| Human UAT Yayasan P4I | NOT_IMPLEMENTED | Matriks acceptance siap; pelaksanaan/hasil/sign-off belum ada |

## 5. Aktor, kebutuhan dan use case

Aktor aplikasi: pengunjung publik, B2B client, managerial analyst dan super_admin. Role tepercaya
berasal dari `user_profiles.role`, default signup b2b_client; metadata yang dapat diedit pengguna
tidak menentukan role. Reviewer dan publisher deliverable merupakan capability eksplisit per
proyek, bukan role ilmiah yang otomatis diberikan kepada super_admin. AI adalah komponen perencana,
bukan pemegang otoritas review/publikasi/persetujuan biaya.

Kebutuhan fungsional yang telah diwujudkan secara lokal mencakup pencarian katalog, penyusunan peta,
penyimpanan konfigurasi, inspeksi pixel, komputasi tersedia, persiapan laporan, revisi/review dan
akses snapshot rilis. Kebutuhan integrasi yang belum dipenuhi mencakup dataset resmi, transport AI
nyata, job durable, storage resmi dan real-client publication. Use case rinci dapat ditelusuri
melalui [matriks UAT](P4I_UAT_ACCEPTANCE_MATRIX.md), bukan diinterpretasikan sebagai hasil UAT.

| Kebutuhan nonfungsional | Implementasi/bukti | Celah sebelum produksi |
|---|---|---|
| Keamanan | Server ACL, validator, RLS rehearsal, explicit approval, secret-safe errors | Live RLS/identity, pentest, distributed quotas/tenant budgets |
| Reproduksibilitas | Recipe/config versions, source metadata, revision hash, SQL hashes | Verified foundation DDL dan real-data version registry |
| Kinerja | Native-window local limits, viewport/simplification, bounded imports | Benchmark aktual dataset besar, tile/query latency, load/soak |
| Keandalan | Input/output fail-closed, cancellation/stale-result guards | Durable queue, backup/restore, worker leases dan provider cancellation |
| Usabilitas | UI konsisten, keyboard/focus, responsif, empty/loading/error states | Human acceptance dan assistive-technology testing |
| Portabilitas | Domain repositories/provider contracts | Adapter Neon/Nhost, claims/IAM/SQL namespace mapping |
| Privasi | Source ACL, client DTO redaction, private downloads, no provider error payload logs | Approved processing/retention/region policy and durable audit |

## 6. Arsitektur perangkat lunak dan route

Next.js 16.3.5/React 19.2.8 berjalan dengan Node 22.23.3 pada pengujian lokal. TypeScript membentuk
kontrak; Zustand memegang sesi MapRecipe/draft; SpatialMap menggunakan Leaflet/react-leaflet.
API memvalidasi identity/role/project access dan meneruskan operasi ke domain/provider contracts.
Supabase tetap adapter auth/database aktif. Raster, AI, job dan consulting mempunyai batas domain
terpisah; tidak dibuat engine peta atau model konfigurasi yang tidak kompatibel.

Route portal: `/spatial/home`, `/spatial/webmap`, `/spatial/data`, `/spatial/help`,
`/spatial/viewer`, `/spatial/ai`, `/spatial/analysis`, `/spatial/consulting`. Viewer lama `/spatial`,
`/login`, `/portal`, `/admin/dashboard`, `/admin/upload`, `/admin/users` dan landing P4I dipertahankan.
API GIS memakai `/api/gis/catalog`, `/vector`, `/tiles`, `/pixel`, `/process`, `/actions`, `/copilot`,
`/compute`; consulting memakai `/api/consulting` dan `/download`; proyek, boundaries, audit,
entitlement, auth session dan flood memiliki route existing. API tetap memeriksa otorisasi sendiri;
proxy navigasi/UI filtering bukan batas keamanan.

Diagram PlantUML tersedia sebagai kode yang dapat direview/render secara lokal:

- [Arsitektur komponen](diagrams/phase-09/architecture.puml)
- [Aktor dan use case](diagrams/phase-09/use-cases.puml)
- [Sequence AI dan eksekusi GIS](diagrams/phase-09/ai-execution.puml)
- [ERD berbasis sumber dan domain lokal](diagrams/phase-09/erd-and-domain.puml)
- [State deliverable](diagrams/phase-09/deliverable-workflow.puml)

Diagram tidak menyatakan deployment/topologi live atau tabel baru telah dibuat. Rendering
PlantUML dan evaluasi diagram oleh pembimbing/pengguna belum dilakukan pada fase ini.

## 7. Model raster/pixel, GIS nyata dan provenance

`RasterDataset`, `RasterBand`, `RasterMetadata`, `RasterStyle`, `PixelSample`, `RasterStatistics`,
`RasterOperation` dan `RasterProcessingResult` tetap memakai kontrak Phase 03. Metadata mencakup
CRS/native grid/pixel size/scale-offset/band/unit/category/NoData/version/period/provenance. Kontrol
izin mencakup setiap operand dan AOI. Grid/encoding/band yang berbeda tidak boleh disamakan diam-diam;
kategori tidak diinterpolasi atau dihitung mean sebagai skor tanpa reclassification eksplisit.

Operasi lokal menggunakan grid DEMO terbatas. Geometri memakai pendekatan bola, bukan survei geodesi;
statistik zonal memakai pusat sel dan mean tanpa pembobotan luas. Clip/mask mengembalikan descriptor
`artifact:null`, bukan GeoTIFF yang sudah dibuat. Tidak ada raster nasional/seluruh array besar di
browser. Tile fixture 16×16 merupakan preview tampilan, bukan pengganti native sample.

Phase 09 memperketat import: source CRS eksplisit, validasi PRJ sebelum parser, transform proj4,
MultiPolygon/holes, ring finite/closed/nondegenerate, ZIP CRC/size/inflate limits dan metadata SHA256.
Dry-run tidak memerlukan credential atau write eksternal. Topologi tetap perlu PostGIS; importer
bukan validator seluruh self-intersection/overlap/hierarki. Promosi staging tetap tindakan terpisah.
`proj4@2.21.0`, yang sebelumnya transitif via shpjs, dideklarasikan langsung agar validasi proyeksi
tidak bergantung pada dependency tidak dinyatakan; versi dependency lain tidak diubah.

Detail sumber CHIRPS/SRTM/WorldCover/P4I soil, temporal semantics, NoData, batas import/viewport,
prosedur handover dan integrasi tile/pixel/zonal/overlay ada pada
[runbook GIS/AI nyata](real-gis-integration-readiness.md). Source descriptor eksternal tidak diberi
native grid palsu atau status available. Lisensi yang diisikan operator bukan bukti hak penggunaan.

## 8. AI GIS, kontrol otonomi dan pekerjaan analisis

Alur existing: trusted identity → katalog/AOI terotorisasi → planning input terbatas → AIProvider →
plan schema/tool whitelist → seluruh langkah dipreflight → tool execution → output/recipe validation
→ atomic session update. UI menolak respons stale; Undo/Redo memulihkan satu batch. Instruksi kode,
SQL, URL arbitrer atau peran yang dikirim model tidak menjadi otoritas. Dataset dan AOI yang tidak
tersedia menghasilkan clarification/unsupported, bukan fixture pengganti yang dilabeli nyata.

Planner connected saat ini tetap deterministik DEMO. Seam structured provider baru mengimplementasi
AIProvider existing dengan transport injected, trusted binding, timeout/AbortSignal, output byte cap,
plan validator dan usage callback. Respons provider nyata yang gagal/invalid tidak fallback ke DEMO.
Factory menolak explicit real/unknown/disabled selection sampai ada adapter nyata. Usage mencatat
elapsed/outcome/token count dari provider atau null; cost UNKNOWN, bukan uang nol atau harga rekaan.
Tidak ada vendor endpoint/secret yang dipilih atau dikonfigurasi di Phase 09.

Komputasi Phase 06 memakai estimasi server, idempotency key, owner/project/source/config snapshot,
approval hash/expiry/one-use dan reauthorization. Batas lokal: otomatis ≤1.024 sel, hard cap 4.096 sel,
AOI ≤2 miliar m², 5 detik, satu job aktif per owner, 32 job/owner dan 128/process, TTL 30 menit,
retry maksimal tiga attempt. Approval tersedia untuk pekerjaan lokal 1.600 sel; UNKNOWN external
cost tetap unavailable. Tidak ada tool AI untuk menyetujui biaya atau rilis deliverable.

Job/approval/usage repository masih process-local. Timeout HTTP tidak membatalkan pekerjaan
provider eksternal secara otomatis. Durable queue, transaksi state, lease, crash recovery, billing
reservation, monetary cap dan rekonsiliasi usage masih belum diimplementasikan. Menambah LLM saja
tidak menyelesaikan kebutuhan tersebut.

## 9. Workflow konsultasi dan skenario end-to-end

Proyek konsultasi menggunakan identitas proyek existing. Revision snapshot mengikat recipe,
konfigurasi, sumber, hasil job owned, teks, waktu dan hash. Independent human review, komentar,
checklist dan publisher grant eksplisit mengatur transisi DRAFT → ANALYSIS_RUNNING/DRAFT →
READY_FOR_REVIEW → CHANGES_REQUESTED/APPROVED → PUBLISHED. Revisi baru membuat DRAFT baru; klien
masih menerima snapshot rilis sebelumnya. AI tidak dapat approve atau publish. Semua rilis yang
berfungsi saat ini adalah `DEVELOPMENT_SIMULATION`, `official:false`.

| Langkah skenario | Status nyata pada Phase 09 |
|---|---|
| 1. Membuka P4I | UI lokal diuji; belum deployment |
| 2. Membuka/membuat peta | DEMO template dan sesi MapRecipe berfungsi; real project/data integration pending |
| 3. Meminta AI membuat peta | Planner DEMO berfungsi; LLM transport baru hanya seam diuji injected |
| 4. Resolusi dataset/AOI | ACL dan ID terverifikasi untuk katalog fixture; real registry belum ada |
| 5. Update MapRecipe | Automatic/preview, atomic update, Undo/Redo berfungsi |
| 6. Inspeksi raster/pixel | Native fixture provider-returned values; real sampling pending |
| 7. Eksekusi analisis | Operasi lokal yang didukung berfungsi; real GEE diblokir |
| 8. Approval biaya tinggi | Batas resource lokal diuji; belum monetary/provider approval nyata |
| 9. Peta/hasil tampil | Actual local computation + result annotations/provenance; bukan hasil lapangan |
| 10. Membuat laporan | PDF/PNG/JSON/Markdown lokal diunduh; provenance/DEMO/limitations disertakan |
| 11. Analis/reviewer | Persona/proyek/grant isolasi development; bukan akun reviewer resmi |
| 12. Klien mengakses hasil approved | Authorized simulated published revision berfungsi; official delivery pending |

Ekspor memakai workflow existing. PDF deliverable memuat identitas, status/revisi/hash, konfigurasi,
sumber, asumsi dan batasan; konteks outline bukan basemap/raster baru. Download mengulang otorisasi,
memakai safe filename/private cache/nosniff dan menyembunyikan catatan internal. Full-map export
mempertahankan workflow PNG/PDF. Pengujian ekspor deterministik memakai basemap none, sehingga
keberhasilan itu tidak membuktikan CORS/terms seluruh basemap eksternal.

## 10. Database, ERD dan portabilitas

Provider-neutral `DatabaseRepositories` tetap mencakup project/user/entitlement/download/lead/audit/
dashboard/boundary/flood. SDK Supabase berada dalam adapter, bukan domain contract. Service role
bypass RLS menuntut otorisasi server yang independen. Pembuatan project+layer masih memakai kompensasi
hapus saat insert layer gagal; itu bukan transaksi atomik lintas request.

DDL fondasi `user_role`, `user_profiles`, `spatial_projects`, `vector_layers`, auth trigger dan
materialized-view dependencies belum terverifikasi. `analysis_reports`/SMCE legacy belum mempunyai
mapping publikasi terverifikasi. Phase 08 menjaga laporan tersebut service-only, mencabut PUBLIC
grants, memperketat RLS/download/sequence/search path dan menguji PostgREST lokal. Fondasi test
sintetis tidak boleh dipromosikan menjadi migrasi live. Runbook/rollback lengkap:
[staging database](staging-database-runbook.md).

Tabel raster/config/recipe/jobs/deliverables produksi belum ditambahkan secara spekulatif. Kontrak
Phase 04–07 tetap menjadi dasar desain adapter durable setelah requirement persistence nyata dan
skema live diverifikasi. ERD membedakan tabel SQL historis, base DDL yang hilang dan domain lokal.
Tidak ada status metodologi VALIDATED yang diperlukan oleh konfigurasi analisis.

Neon/Nhost tetap alternatif, bukan migrasi fase ini. Perlu mapping `auth.uid`, auth identities,
roles/grants/BYPASSRLS, PostGIS namespace, transport SQL/GraphQL, FK relation queries dan storage.
Supabase tetap aktif. Detail: [backend architecture](backend-provider-architecture.md).

## 11. Temuan keamanan dan perbaikan Phase 09

| Temuan | Dampak | Tindakan/batas verifikasi |
|---|---|---|
| Endpoint flood legacy dapat melewati governance job | Potensi biaya/compute tanpa approval sesuai kebijakan baru | Guard pada route, service dan initializer; valid authenticated input 503 sebelum DB/SDK; diuji mock, tanpa external call |
| `Number(null/false/'')` menghasilkan nol | NoData dapat menjadi ukuran dunia nyata palsu | Strict finite numeric values, bounded unit scores, categorical histogram validation; model version bumped |
| SHP parser dapat mengabaikan PRJ invalid | Salah lokasi/CRS secara diam-diam | Explicit proj4 validation, actual projected SHP fixture; reject missing/conflicting CRS |
| Import/decompress/geometri belum dibatasi memadai | Konsumsi memori/CPU dan input ambigu | Caps dan ZIP CRC/bounded inflate; ring checks; topology review tetap pending |
| Error backend dicetak lengkap | Potensi bocor token/payload pada log | Generic structured error code tanpa provider exception text; debug detail aman perlu pipeline observability berikutnya |
| Public viewport/Copilot tanpa containment proses | API abuse dan oversubscription | Fixed process-wide minute/concurrency budgets; 429/Retry-After; limits bukan distributed tenant quota |
| Real AI selection dapat menjadi ambigu | Risiko fabricated fallback ketika adapter dipilih tetapi gagal/tidak ada | Explicit selection fail-closed; structured adapter tidak fallback |

Batas keamanan tersisa: live RLS belum dibuktikan; secret rotation/retention belum dijalankan;
edge quotas dan request-body deadlines belum menyeluruh; multipart admin upload belum memiliki
containment komprehensif setara importer CLI; auth endpoints/lead submission masih memerlukan
abuse policy tersendiri; audit/usage durable belum ada; resource caps instance-wide dapat digunakan
untuk menghabiskan kapasitas bersama. Ini bukan sertifikasi pentest atau jaminan aman produksi.

## 12. Performance, hosting dan kesiapan operasional

Node 22 build/start lokal berhasil. Hal itu tidak memverifikasi paket **Hostinger Business Hosting**
yang sebenarnya: perlu konfirmasi dukungan managed Node/Next, versi Node, build command, persistent
process, port/reverse proxy/Host/origin, memory/CPU/timeouts, outbound TLS, environment secrets,
filesystem persistence, logs dan restart policy. Jangan mengasumsikan setiap paket shared/business
mendukung arsitektur yang sama. Tidak ada akun Hostinger atau konfigurasi deployment yang diubah.

Supabase adapter memakai HTTP/PostgREST, bukan pool koneksi PostgreSQL di proses Next. Ini tidak
menghilangkan batas koneksi/query pada backend. Direct SQL provider masa depan memerlukan pooler,
transaction boundary dan connection budgeting. No benchmark nasional, concurrency load/soak,
real raster tile latency/cache expiry atau GEE throughput dijalankan; tidak ada angka SLA rekaan.

Batas viewport/import/job mengurangi beban lokal. Realtime national rendering memerlukan dataset
partition/index/query-plan review, payload budget, caching/tile generalization dan benchmark pada
staging resmi. Numeric flood cache historis tujuh hari dan tile expiry estimate 45 menit belum
terverifikasi terhadap real provider; perubahan model version mencegah cache lama dianggap hasil
semantik baru. Masa berlaku token provider harus berasal dari kontrak provider nyata.

Client localStorage tidak cocok sebagai penyimpanan bukti kontrak rahasia tanpa kebijakan perangkat,
retention dan clear-data. Process-local consulting room berumur dua jam; restart menghapus job/
report development. Hostinger HTTP process bukan durable worker. Sebelum produksi perlu backup,
restore rehearsal, incident handling, tenant isolation, data minimization dan kontrol biaya aktual.

## 13. Pengujian Phase 09 dan kegagalan yang dicatat

Baseline Phase 08: lint/typecheck/build dan 230 tes/33 file lulus. Hasil akhir aplikasi: **257 tes/
36 file, lint, typecheck dan build lulus**. Tambahan 27 tes mencakup importer, transform SHP/GeoJSON,
ZIP rejection, NoData, external gating, AI selection/structured plans/usage, resource budget,
body size, secret-safe logging, viewport dan valid legacy flood denial.

Browser Chromium memakai script existing: Phase02 portal smoke, Phase03 raster, Phase06 compute,
Phase07 deliverable. Semua lulus. Portal diuji pada lebar 320/390/768/1024/1480; raster dan client
workspace juga diuji desktop/mobile. PDF/PNG/JSON/Markdown benar-benar diunduh. Tidak ada pageerror
pada suite yang dicatat; tidak ada panggilan GEE pada suite compute/deliverable. Axe memeriksa
keadaan yang tercatat, bukan sertifikasi seluruh aplikasi atau hasil usability manusia.

Production-mode smoke lokal (`next start`, DEMO flag tetap diset) memeriksa penolakan fixture,
consulting/compute, pixel/vector/tile/Copilot, admin/flood anonymous denial dan API rate limits.
Dua belas pemeriksaan lulus. Ini pengujian mode produksi pada host lokal, bukan deployment produksi.
Bukti tersimpan di [evidence Phase09](evidence/phase-09/verification-summary.json).

Kegagalan selama pengerjaan tidak disembunyikan: typecheck awal gagal karena guard bertipe never
mengganggu narrowing dan assertion test plan terlalu luas; keduanya diperbaiki, typecheck akhir
lulus. Smoke production awal memakai GET pada endpoint compute POST-only (405) dan zoom tile 1
di luar rentang valid (400); request QA diperbaiki menjadi valid sebelum menguji isolation. Rangkaian
Phase06 awal tidak menjalankan Axe karena nama env berbeda; diulang dengan `P4I_AXE_PATH` yang benar.
Tidak ada assertion keamanan yang dihapus/dinonaktifkan untuk mendapat hasil lulus.

Yang tidak diuji: Supabase real-user signup/login/refresh/admin happy paths, live migration/RLS,
real P4I imports/control points, GEE registration/credential/sample/tiles, paid LLM output/cost,
Hostinger deployment/load/recovery dan human UAT. Rehearsal DB Phase08 tidak diulang karena Phase09
tidak mengubah SQL; bukti historisnya tetap 340 pemeriksaan sintetis, bukan pengujian live terbaru.

## 14. UAT, penelitian dan interpretasi akademik

[Matriks UAT Yayasan P4I](P4I_UAT_ACCEPTANCE_MATRIX.md) memuat 20 kasus actor/workflow dan field
hasil yang harus diisi manusia. Status human NOT_RUN/BLOCKED dipertahankan. Tes otomatis memberi
bukti kesesuaian implementasi terhadap assertions; tidak membuktikan kepuasan pengguna, efisiensi
organisasi, akurasi spasial/banjir atau manfaat bisnis. Klaim penelitian tersebut memerlukan desain
metode, instrumen, partisipan/izin, data dan analisis tersendiri oleh peneliti.

Laporan/PlantUML ini dapat dipakai sebagai dokumentasi artefak, arsitektur, kebutuhan, keputusan,
traceability pengujian dan keterbatasan skripsi Sistem Informasi. Jangan menulis “telah diterima
Yayasan”, “metodologi tervalidasi”, atau angka akurasi berdasarkan screenshot/fixture. Cantumkan
commit/build/dataset yang diuji dan pisahkan rancangan masa depan dari fungsi yang tersedia.

## 15. Checklist transisi produksi yang direkomendasikan

1. **Pemilik produk/reviewer Git:** review dan rekonsiliasi seluruh PR bertumpuk; jangan menganggap
   phase feature branch sudah berada di main. Tetapkan scope pilot kecil dan kriteria penerimaan.
2. **DBA:** peroleh verified foundation/auth/view DDL + ownership/extension namespace; lengkapi
   migration gate, authorize disposable staging, replay dan uji lima identitas melalui PostgREST.
3. **Pemilik data/GIS:** serahkan batas administratif/soil/legend/version/control points serta hak
   penggunaan/redistribusi. Lakukan dry-run bounded, topology/provenance review, lalu upload hanya
   bila lingkupnya disetujui. Tidak ada persetujuan upload nasional dalam fase ini.
4. **Pemilik bisnis/cloud:** verifikasi registrasi GEE komersial, terms/billing, IAM/asset access,
   budget maksimum dan usage policy. Implementasi governed adapter harus mendahului pembukaan guard.
5. **Backend/operasi:** durable job/revision/review/publication/usage storage, queue/worker lease,
   idempotency/CAS/transaksi, cancellation acknowledgement, result storage dan restart recovery.
6. **AI/privacy owner:** pilih provider/model berdasarkan kebutuhan dan terms; approve transfer data,
   region/retention, endpoint/secrets dan limits. Implementasikan transport streaming aman; uji
   adversarial plans dan output nyata pada scope yang diizinkan, tanpa fallback.
7. **Security/ops:** distributed edge/user/project quotas, safe multipart handling, audit/observability,
   secret rotation, backup/restore, incident response dan authorization penetration tests.
8. **Hosting owner:** verifikasi paket Hostinger dan Node/Next constraints aktual; jalankan load/soak,
   timeout/cache/tile/DB connection/recovery tests. Uji release/rollback di staging terotorisasi.
9. **Yayasan P4I:** jalankan UAT role-based dan review profesional deliverable dengan data berizin;
   simpan evidence/defect/sign-off nyata. Reviewer/publisher permission harus eksplisit.
10. **Release authority:** produksi/publikasi resmi hanya setelah blocker ditutup dan tindakan
    deployment/publikasi secara eksplisit diotorisasi. Phase09 tidak melakukan tindakan tersebut.

## 16. Daftar perubahan Phase 09

Daftar file persis terhadap basis `5e9d651` tersedia pada
[changed-files.txt](evidence/phase-09/changed-files.txt). File utama: importer dan helper GIS,
source requirements, external readiness/NoData helpers, structured AIProvider, per-process request
budget, API guards/size/logging, test fixtures/suites dan runbook/UAT/PlantUML/laporan ini.
Tidak ada migrasi database atau penggantian MapRecipe/SpatialMap. Laporan fase sebelumnya tetap
tersimpan sebagai bukti historis, dengan pembaruan status terbaru pada `docs/implementation-report.md`.
