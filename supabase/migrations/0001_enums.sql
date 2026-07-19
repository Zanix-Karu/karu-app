-- 0001: Domain enums for the Karu marketplace
-- Karu: verified car-rental marketplace for Cameroon (Douala / Yaoundé).
-- Postgres enums give us cheap, DB-enforced state machines for the core flows.

-- Who someone is on the platform.
CREATE TYPE user_role AS ENUM ('customer', 'vendor', 'admin');

-- Cities Karu operates in at launch (matches the waitlist taxonomy on the website).
CREATE TYPE city AS ENUM ('douala', 'yaounde', 'other');

-- Vendor verification lifecycle. A vendor cannot list vehicles until 'verified'.
CREATE TYPE vendor_status AS ENUM ('pending', 'verified', 'rejected', 'suspended');

-- Documents a vendor must submit for verification (Cameroon-specific).
--   rccm          = business registration (Registre du Commerce et du Crédit Mobilier)
--   carte_grise   = vehicle registration certificate
--   insurance     = insurance certificate
--   roadworthiness = roadworthiness / technical inspection
CREATE TYPE document_type AS ENUM ('rccm', 'carte_grise', 'insurance', 'roadworthiness');
CREATE TYPE document_status AS ENUM ('pending', 'approved', 'rejected');

-- Vehicle classification and listing state.
CREATE TYPE vehicle_category AS ENUM ('economy', 'sedan', 'suv', 'pickup', 'van', 'luxury');
CREATE TYPE transmission AS ENUM ('manual', 'automatic');
CREATE TYPE vehicle_status AS ENUM ('draft', 'active', 'inactive');

-- Booking state machine:
--   requested  -> customer asks, awaiting vendor
--   confirmed  -> vendor accepted (within 24h SLA)
--   rejected   -> vendor declined
--   cancelled  -> customer or vendor cancelled a confirmed/requested booking
--   in_progress-> trip is underway (pickup done)
--   completed  -> trip finished, reviews unlocked
CREATE TYPE booking_status AS ENUM (
  'requested', 'confirmed', 'rejected', 'cancelled', 'in_progress', 'completed'
);

-- Payments: built for Cameroon mobile money, escrow-style holding.
CREATE TYPE payment_provider AS ENUM ('mtn_momo', 'orange_money');
--   pending  -> initiated, not yet captured
--   held     -> funds held in escrow (post-confirmation, pre-trip-completion)
--   released -> released to vendor after trip
--   refunded -> returned to customer
--   failed   -> provider error / declined
CREATE TYPE payment_status AS ENUM ('pending', 'held', 'released', 'refunded', 'failed');

-- Two-sided reviews: a booking yields at most one review per side.
CREATE TYPE review_target AS ENUM ('customer', 'vendor');
