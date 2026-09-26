-- 0026: Harden storage buckets — cap size and restrict MIME type.
--
-- 0012/0025 created vehicle-photos, vendor-documents and feedback-images with
-- no limits, so any authenticated (and, for the public vehicle-photos
-- bucket, effectively any) uploader could push arbitrarily large or
-- arbitrarily typed files — including an SVG/HTML "photo" that executes
-- script when opened directly from the public bucket. Storage enforces these
-- against the Content-Type the uploader declares; the API additionally
-- checks the stored object's recorded mimetype before trusting an upload
-- (see attachPhoto / feedback create).

UPDATE storage.buckets
SET file_size_limit = 8 * 1024 * 1024, -- 8 MiB
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'vehicle-photos';

UPDATE storage.buckets
SET file_size_limit = 15 * 1024 * 1024, -- 15 MiB — scans/photos of paperwork
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
WHERE id = 'vendor-documents';

UPDATE storage.buckets
SET file_size_limit = 8 * 1024 * 1024, -- 8 MiB
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'feedback-images';
