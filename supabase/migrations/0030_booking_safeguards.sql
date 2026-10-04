-- 0030: Booking safeguards — closing the ways a party could cheat Karu or
-- each other (docs/IDEAS-2026-10-04.md, section 10).
--
--   * Handover/return codes lock after repeated wrong guesses. Four digits is
--     9,000 possibilities; at the API's 20 requests a minute a vendor could
--     walk the space in an afternoon and start or end a trip with nobody else
--     present.
--   * Cancellations record who cancelled, why, and whether the deposit is
--     owed back, so a provider who keeps dropping confirmed customers shows
--     up in the admin console instead of disappearing into "cancelled".
--   * Condition reports at handover and return (photos, fuel, odometer), so a
--     damage dispute has evidence on both sides rather than one person's word.
--   * Chat messages are tagged when they look like an attempt to move the
--     deal off Karu, for the admin's attention. Redaction already strips
--     numbers; this catches the talk around them.

-- ── Bookings: code lockout + cancellation record ────────────────────────────

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS code_failed_attempts INTEGER NOT NULL DEFAULT 0
    CHECK (code_failed_attempts >= 0),
  -- Set once the attempt limit is hit. Only an admin can move the booking on
  -- from here, which is the point: a locked code is a human conversation.
  ADD COLUMN IF NOT EXISTS code_locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by user_role,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT
    CHECK (cancellation_reason IS NULL OR char_length(cancellation_reason) <= 500),
  -- What the cancellation policy says about the deposit. Null = not decided
  -- (or nothing was cancelled). Moving the money stays an admin action.
  ADD COLUMN IF NOT EXISTS deposit_refund_due BOOLEAN,
  -- When the car came back. Opens the window for a damage report.
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Provider-reliability queries: "confirmed bookings this vendor cancelled".
CREATE INDEX IF NOT EXISTS idx_bookings_vendor_cancellations
  ON public.bookings (vendor_id, cancelled_at)
  WHERE cancelled_by = 'vendor';

-- ── Condition reports ───────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE inspection_stage AS ENUM ('handover', 'return');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.booking_inspections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  stage         inspection_stage NOT NULL,
  recorded_by   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  -- Snapshotted, like booking_messages.sender_role.
  recorded_role user_role NOT NULL,
  -- Storage paths in the private booking-inspections bucket.
  photo_paths   TEXT[] NOT NULL DEFAULT '{}'
    CHECK (cardinality(photo_paths) BETWEEN 4 AND 12),
  -- Eighths of a tank, the way a fuel gauge reads.
  fuel_eighths  SMALLINT CHECK (fuel_eighths BETWEEN 0 AND 8),
  odometer_km   INTEGER CHECK (odometer_km >= 0),
  notes         TEXT CHECK (notes IS NULL OR char_length(notes) <= 1000),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One report per side per stage; re-recording replaces it.
  UNIQUE (booking_id, stage, recorded_role)
);

CREATE INDEX IF NOT EXISTS idx_booking_inspections_booking
  ON public.booking_inspections (booking_id);

CREATE TRIGGER trg_booking_inspections_updated_at
  BEFORE UPDATE ON public.booking_inspections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- API-only (service role), same stance as vehicle_blocks.
ALTER TABLE public.booking_inspections ENABLE ROW LEVEL SECURITY;

-- Private: photos of a customer's rental are evidence, not marketing.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'booking-inspections',
  'booking-inspections',
  false,
  8 * 1024 * 1024,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ── Chat: off-platform flags ────────────────────────────────────────────────

ALTER TABLE public.booking_messages
  ADD COLUMN IF NOT EXISTS flags TEXT[] NOT NULL DEFAULT '{}';
