-- 0009: A car can never be double-booked.
-- Enforced by Postgres itself, not just API code: an exclusion constraint
-- rejects any two bookings for the same vehicle whose (inclusive) date ranges
-- overlap while both hold the car ('confirmed' or 'in_progress'). Requested,
-- rejected, cancelled and completed bookings never block dates.
-- Two racing "confirm" transactions cannot both succeed — one gets a
-- constraint violation (SQLSTATE 23P01) which the API maps to a 409.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    vehicle_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  )
  WHERE (status IN ('confirmed', 'in_progress'));
