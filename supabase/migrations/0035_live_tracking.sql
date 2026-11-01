-- 0035: Uber-style tracking of the delivery leg (docs/IDEAS-2026-10-04.md #3).
--
-- Only the trip *to* the customer is tracked: the driver's phone shares its
-- position from "on my way" until the handover, and the customer watches the
-- car come in on a map with an ETA. Tracking the whole rental would mean
-- watching a customer drive around for a week, which is a different product
-- with a different privacy bargain, and needs a GPS box in the car.
--
-- One latest position per booking, overwritten on every update and wiped
-- when tracking stops. No trail is kept: nobody needs yesterday's route.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS tracking_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tracking_lat DOUBLE PRECISION CHECK (tracking_lat BETWEEN -90 AND 90),
  ADD COLUMN IF NOT EXISTS tracking_lng DOUBLE PRECISION CHECK (tracking_lng BETWEEN -180 AND 180),
  ADD COLUMN IF NOT EXISTS tracking_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tracking_ended_at TIMESTAMPTZ;
