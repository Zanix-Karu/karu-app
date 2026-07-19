-- 0005: Bookings
-- The core marketplace transaction. A customer requests a vehicle for a date
-- range; the vendor confirms or rejects. vendor_id is denormalised from the
-- vehicle so we can query "a vendor's bookings" without a join.
-- daily_rate_xaf / total_xaf are snapshotted at request time so later price
-- edits on the vehicle never change an existing booking's amount.

CREATE TABLE IF NOT EXISTS bookings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id      UUID NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  customer_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  vendor_id       UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  pickup_location TEXT,
  status          booking_status NOT NULL DEFAULT 'requested',
  daily_rate_xaf  INTEGER NOT NULL CHECK (daily_rate_xaf > 0),
  total_xaf       INTEGER NOT NULL CHECK (total_xaf > 0),
  currency        TEXT NOT NULL DEFAULT 'XAF',
  customer_note   TEXT,
  vendor_note     TEXT,
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT booking_dates_valid CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_bookings_customer ON bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_vendor ON bookings(vendor_id);
CREATE INDEX IF NOT EXISTS idx_bookings_vehicle ON bookings(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
-- Used to detect date-range overlaps when checking availability.
CREATE INDEX IF NOT EXISTS idx_bookings_vehicle_dates ON bookings(vehicle_id, start_date, end_date);

CREATE TRIGGER trg_bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
