-- 0027: Vendor suspension reason (REQ-9).
--
-- Suspending a vendor gave no way to record why: the vendor saw only a
-- status flip with no explanation, and a later admin reviewing the account
-- had no record of what triggered it. Holds the reason for the CURRENT
-- suspension only — cleared on reinstatement, since a resolved reason is
-- stale, not history worth keeping on the row itself.
--
-- NOTE: depends on migration numbering — if 0026_storage_bucket_limits.sql
-- (branch fix/api-hardening-sep19, PR #29) hasn't merged yet when this
-- lands, renumber this file to avoid a collision.

ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS suspension_reason TEXT;
