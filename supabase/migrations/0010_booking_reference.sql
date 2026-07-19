-- 0010: Human-readable booking reference, e.g. KARU-20260719-0042.
-- Used in confirmation emails and the admin screen. A per-day counter table
-- plus an atomic upsert guarantees uniqueness even under concurrent bookings.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reference TEXT UNIQUE;

CREATE TABLE IF NOT EXISTS booking_counters (
  day     DATE PRIMARY KEY,
  counter INTEGER NOT NULL DEFAULT 0
);

-- Atomically increments today's counter and returns the formatted reference.
-- The INSERT ... ON CONFLICT row lock makes concurrent calls serialize safely.
CREATE OR REPLACE FUNCTION next_booking_reference()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  n INTEGER;
BEGIN
  INSERT INTO booking_counters AS bc (day, counter)
  VALUES (CURRENT_DATE, 1)
  ON CONFLICT (day) DO UPDATE SET counter = bc.counter + 1
  RETURNING counter INTO n;

  RETURN 'KARU-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || lpad(n::TEXT, 4, '0');
END;
$$;
