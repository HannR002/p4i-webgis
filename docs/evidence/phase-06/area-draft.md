# P4I — Draft laporan analisis

**EKSPERIMENTAL · DEMO**

calculateArea
Luas AOI DEMO: 247190378.42 m² (pendekatan bola).

Job: compute-3e610d5a-fea1-46d5-b564-18c75ce1863a
Request SHA-256: 435eb4d4932bf3db36a34d2bcc52214888c4064972ea79e965f80885d329a46b
Konfigurasi: pengukuran geometri · v1

## Hasil
```json
{
  "values": {
    "areaSquareMetres": 247190378.41552585,
    "aoiId": "demo-aoi-west"
  },
  "raster": null
}
```

## Parameter dan sumber
```json
{
  "schemaVersion": 1,
  "operation": {
    "tool": "calculateArea",
    "aoiId": "demo-aoi-west"
  },
  "configuration": null,
  "projectId": null,
  "idempotencyKey": "af6e6c57-dfe4-4ca9-92a5-72f74522b69b"
}
```

Kalkulasi deterministik lokal P4I; fixture DEMO atau input preferensi pengguna. Bukan pengukuran resmi.

- Eksperimental; tidak menyatakan validasi atau keunggulan metodologi.
- Tidak ada GEE, PostGIS atau worker produksi yang dijalankan.

Draft ini tidak menyatakan validasi metodologi atau peringkat ilmiah.