-- 0011: Keep the payment-provider decision open + vendor unavailability.
--
-- The MVP takes a 10–15% deposit through a UK card service (Stripe or Wise,
-- pending the legal answer on holding funds); mobile money comes later. So:
--   * widen payment_provider beyond MoMo/Orange with 'card' and 'manual'
--     ('manual' = recorded by the team outside any provider),
--   * record the deposit amount on the booking,
--   * let vendors/the team block dates a car is unavailable outside bookings.

ALTER TYPE payment_provider ADD VALUE IF NOT EXISTS 'card';
ALTER TYPE payment_provider ADD VALUE IF NOT EXISTS 'manual';

-- Deposit actually charged for the booking (subset of total_xaf).
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS deposit_xaf INTEGER
  CHECK (deposit_xaf IS NULL OR deposit_xaf > 0);

-- Manual unavailability windows (maintenance, private use, …).
-- Availability = active vehicle − overlapping held bookings − blocks.
CREATE TABLE IF NOT EXISTS vehicle_blocks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date   DATE NOT NULL,
  reason     TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT vehicle_block_dates_valid CHECK (end_date >= start_date),
  -- Overlapping blocks for the same car make no sense; keep them disjoint.
  CONSTRAINT vehicle_blocks_no_overlap EXCLUDE USING gist (
    vehicle_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  )
);

CREATE INDEX IF NOT EXISTS idx_vehicle_blocks_vehicle_dates
  ON vehicle_blocks (vehicle_id, start_date, end_date);

-- Service role bypasses RLS; enabling it with no policies means no end-user
-- JWT can touch the table directly (same defense-in-depth stance as 0008).
ALTER TABLE vehicle_blocks ENABLE ROW LEVEL SECURITY;
