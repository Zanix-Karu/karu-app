-- 0022: Move btree_gist out of the public schema (DB-1, remaining item).
--
-- RUN THIS DELIBERATELY, NOT AS PART OF A ROUTINE DEPLOY.
--
-- Why it is separated from 0021: this extension supplies the operator classes
-- behind two EXCLUDE constraints —
--   * bookings_no_overlap (0009), which is the reason double-booking is
--     impossible, and
--   * vehicle_blocks_no_overlap (0011).
-- Relocating the extension moves those operator classes. Postgres keeps the
-- constraints working because the dependency is by OID rather than by name,
-- but this is the one migration in the set whose failure mode is "two people
-- can book the same car", so it gets verified rather than assumed.
--
-- Before running:
--   1. Take a restore point (Supabase dashboard → Database → Backups).
--   2. Run outside booking hours.
--   3. Run the verification block at the bottom and read the output.

-- Supabase provisions this schema and keeps it on the default search_path.
CREATE SCHEMA IF NOT EXISTS extensions;

ALTER EXTENSION btree_gist SET SCHEMA extensions;

-- ── Verification ───────────────────────────────────────────────────────────
-- Both constraints must still be present and valid. This raises rather than
-- returning a row, so a failure aborts the migration instead of being missed
-- in query output.
DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n
  FROM pg_constraint
  WHERE conname IN ('bookings_no_overlap', 'vehicle_blocks_no_overlap')
    AND contype = 'x'
    AND convalidated;

  IF n <> 2 THEN
    RAISE EXCEPTION
      'btree_gist relocation left % of 2 exclusion constraints valid — rolling back', n;
  END IF;
END $$;

-- A live proof that the overlap guard still bites: try to insert a booking
-- that overlaps an existing confirmed one and require it to fail. Wrapped so
-- the probe never persists.
DO $$
DECLARE
  v_id uuid;
  c_id uuid;
  ven_id uuid;
BEGIN
  SELECT vehicle_id, customer_id, vendor_id INTO v_id, c_id, ven_id
  FROM bookings
  WHERE status IN ('confirmed', 'in_progress')
  LIMIT 1;

  IF v_id IS NULL THEN
    RAISE NOTICE 'No confirmed booking to probe against; constraint validity checked structurally only.';
    RETURN;
  END IF;

  BEGIN
    INSERT INTO bookings (vehicle_id, customer_id, vendor_id, start_date, end_date, status, total_xaf)
    SELECT v_id, c_id, ven_id, start_date, end_date, 'confirmed', 1
    FROM bookings WHERE vehicle_id = v_id AND status IN ('confirmed', 'in_progress') LIMIT 1;

    RAISE EXCEPTION 'Overlap guard did NOT fire — bookings_no_overlap is not protecting this table';
  EXCEPTION
    WHEN exclusion_violation THEN
      RAISE NOTICE 'Overlap guard fired as expected — bookings_no_overlap is intact.';
  END;
END $$;
