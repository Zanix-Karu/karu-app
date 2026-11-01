-- 0037: Seasonal prices (docs/IDEAS-2026-10-04.md #7, phase 1).
--
-- A provider can raise (or cut) the daily rate for a yearly date range, e.g.
-- +20% from 15 Dec to 5 Jan for the diaspora season. The change is worked out
-- by quoteBooking and frozen into bookings.total_xaf like every other price,
-- so editing seasons later never alters an existing booking.
--   [{ "label": "Christmas", "from": "12-15", "to": "01-05", "percent": 20 }]

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS price_seasons JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(price_seasons) = 'array' AND jsonb_array_length(price_seasons) <= 8);
