-- 0029: Vendor bio/description.
--
-- A short, customer-facing "about this provider" blurb (50-100 words),
-- distinct from a vehicle's own `description`. Word-count is enforced in the
-- API layer only (WordCountRange validator) — every existing CHECK in this
-- schema constrains numbers/enums, never free text, so there's no precedent
-- for a content-shaped CHECK here.

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS bio TEXT;
