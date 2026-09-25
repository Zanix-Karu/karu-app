-- 0028: Handover and return verification codes (REQ-6).
--
-- Uber-Eats-style confirmation: the customer holds a short code, the vendor
-- enters it to confirm the exchange actually happened in person, rather than
-- a vendor being able to click "in progress" / "completed" on their own say-so
-- with no one else in the loop. Generated once, at confirmation time, so both
-- codes exist well before either handover moment.
--
-- NOTE: numbered assuming 0026 (PR #29, fix/api-hardening-sep19) and 0027
-- (PR #33, feat/req-9-vendor-suspension-refactor) land first. Renumber this
-- file if either doesn't merge before this one.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS handover_code TEXT,
  ADD COLUMN IF NOT EXISTS return_code TEXT;
