-- 0032: Customer ID verification (docs/IDEAS-2026-10-04.md #9).
--
-- Vendors have been verified since 0003; customers never were. Anyone with an
-- email could book a self-drive car, and the provider met a stranger at the
-- handover with nothing to check them against. Now a customer uploads their
-- driving licence (both sides), a national ID card or passport, and a selfie;
-- an admin reviews them; and at the handover the provider sees the verified
-- name and selfie to match against the person and the physical licence.
--
-- This is deliberately the manual first tier. An automated KYC provider
-- (Smile ID has the best Cameroon coverage) can replace the admin step later
-- behind the same statuses without the screens changing.
--
-- Data protection: ID scans are the most sensitive thing Karu holds. They sit
-- in a private bucket, are only ever served through short-lived signed URLs
-- issued by the API, and the API never hands a provider anything but the
-- selfie and the verified name.

DO $$ BEGIN
  CREATE TYPE customer_verification_status AS ENUM ('unverified', 'pending', 'verified', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE customer_document_type AS ENUM (
    'licence_front',
    'licence_back',
    'national_id',
    'passport',
    'selfie'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verification_status customer_verification_status NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS verification_note TEXT
    CHECK (verification_note IS NULL OR char_length(verification_note) <= 500),
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  -- Typed by the customer, checked by the admin against the licence scan.
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS licence_expires_at DATE;

CREATE INDEX IF NOT EXISTS idx_profiles_verification_pending
  ON public.profiles (updated_at)
  WHERE verification_status = 'pending';

CREATE TABLE IF NOT EXISTS public.customer_documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type        customer_document_type NOT NULL,
  file_path   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One current file per type; re-uploading replaces it.
  UNIQUE (profile_id, type)
);

CREATE TRIGGER trg_customer_documents_updated_at
  BEFORE UPDATE ON public.customer_documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.customer_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_documents FROM anon, authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'customer-documents',
  'customer-documents',
  false,
  10 * 1024 * 1024,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;
