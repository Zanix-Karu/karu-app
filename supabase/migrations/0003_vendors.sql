-- 0003: Vendors + verification documents
-- A vendor is a car-rental operator. One vendor per profile. Must reach
-- status='verified' (documents approved by an admin) before listing vehicles.

CREATE TABLE IF NOT EXISTS vendors (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id     UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  business_name  TEXT NOT NULL,
  rccm_number    TEXT,
  city           city NOT NULL,
  contact_phone  TEXT,
  contact_email  TEXT,
  status         vendor_status NOT NULL DEFAULT 'pending',
  verified_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendors_status ON vendors(status);
CREATE INDEX IF NOT EXISTS idx_vendors_city ON vendors(city);

CREATE TRIGGER trg_vendors_updated_at
  BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Verification documents. file_path points at an object in Supabase Storage
-- (private bucket); we never store raw files in the DB.
CREATE TABLE IF NOT EXISTS vendor_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id    UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  type         document_type NOT NULL,
  file_path    TEXT NOT NULL,
  status       document_status NOT NULL DEFAULT 'pending',
  reviewed_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at  TIMESTAMPTZ,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vendor_id, type)
);

CREATE INDEX IF NOT EXISTS idx_vendor_documents_vendor ON vendor_documents(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_documents_status ON vendor_documents(status);
