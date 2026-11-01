-- 0034: Where things are (docs/IDEAS-2026-10-04.md #8 and #4).
--
-- Until now a provider was a city enum plus some free text, so the app could
-- not answer the most natural question a customer has ("who's near me?") or
-- price a delivery by how far it actually goes.
--
--   * vendors.lat / lng: the provider's base, dropped as a pin at onboarding.
--     Exact coordinates never leave the API publicly: browse and the
--     directory get a point rounded to about a kilometre, because plenty of
--     operators run from home. The exact pin is shared once a booking is
--     accepted.
--   * Delivery zones: rings around that base, each with its own fee, instead
--     of one flat fee that overcharged next door and undercharged across
--     town. Plus "free delivery from N days", the customer-friendly framing:
--     on a longer rental the fee is small next to the total and the provider
--     can fold it into the daily rate.
--   * bookings.delivery_lat / lng / landmark: addresses in Douala and Yaoundé
--     are often "behind the pharmacy", so the customer drops a pin and adds
--     directions, and the fee is computed from the pin, not trusted from them.

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION CHECK (lat BETWEEN -90 AND 90),
  ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION CHECK (lng BETWEEN -180 AND 180),
  -- [{ "max_km": 5, "fee_xaf": 0 }, { "max_km": 15, "fee_xaf": 5000 }], sorted
  -- by max_km. Beyond the last ring: delivery not offered. Empty = use the
  -- old flat delivery_fee_xaf.
  ADD COLUMN IF NOT EXISTS delivery_zones JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(delivery_zones) = 'array'),
  ADD COLUMN IF NOT EXISTS free_delivery_min_days INTEGER
    CHECK (free_delivery_min_days IS NULL OR free_delivery_min_days >= 1),
  ADD CONSTRAINT vendors_lat_lng_together CHECK ((lat IS NULL) = (lng IS NULL));

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS delivery_lat DOUBLE PRECISION CHECK (delivery_lat BETWEEN -90 AND 90),
  ADD COLUMN IF NOT EXISTS delivery_lng DOUBLE PRECISION CHECK (delivery_lng BETWEEN -180 AND 180),
  -- Straight-line distance from the provider's base, frozen like the fee.
  ADD COLUMN IF NOT EXISTS delivery_distance_km NUMERIC(6, 1) CHECK (delivery_distance_km >= 0),
  ADD COLUMN IF NOT EXISTS delivery_landmark TEXT
    CHECK (delivery_landmark IS NULL OR char_length(delivery_landmark) <= 300);
