-- MODUL 2: Migrasi Penambahan Kolom Storage

-- Tambahkan kolom file_size_bytes ke vector_layers untuk melacak penggunaan storage
ALTER TABLE public.vector_layers 
ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT DEFAULT 0;
