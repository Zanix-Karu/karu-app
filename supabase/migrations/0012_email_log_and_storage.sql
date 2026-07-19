-- 0012: Transactional-email audit log + storage buckets.
--
-- Every email the API sends (booking requested/confirmed/rejected/cancelled)
-- is recorded here so delivery is auditable and retryable. Email failure must
-- never roll back a booking — the API logs 'failed' and moves on.

CREATE TABLE IF NOT EXISTS email_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID REFERENCES bookings(id) ON DELETE SET NULL,
  recipient   TEXT NOT NULL,
  template    TEXT NOT NULL,
  locale      TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'fr')),
  provider_id TEXT,             -- Resend message id
  status      TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_log_booking ON email_log (booking_id);

-- Service-role only (RLS on, no policies).
ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;

-- Storage buckets:
--   vehicle-photos   — public read (listing images served directly)
--   vendor-documents — private; only signed URLs issued by the API
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('vehicle-photos', 'vehicle-photos', true),
  ('vendor-documents', 'vendor-documents', false)
ON CONFLICT (id) DO NOTHING;
