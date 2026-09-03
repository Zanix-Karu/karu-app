-- 0021: Supabase security-advisor hygiene (DB-1).
--
-- Two classes of finding, both from `get_advisors`:
--
-- 1. Mutable search_path on functions, several of them SECURITY DEFINER. A
--    definer function that resolves unqualified names through the caller's
--    search_path can be tricked into calling an attacker's object shadowing a
--    real one. handle_new_user() was already pinned in 0014; these are the
--    rest. ALTER FUNCTION is used rather than CREATE OR REPLACE so the bodies
--    are not restated here and cannot drift from the migrations that own them.
ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.current_user_role() SET search_path = public;
ALTER FUNCTION public.current_vendor_id() SET search_path = public;
ALTER FUNCTION public.next_booking_reference() SET search_path = public;

-- 2. SECURITY DEFINER helpers were callable by end users over /rest/v1/rpc/*.
--    0015 granted EXECUTE on every function in `public` to anon and
--    authenticated, which swept these up. They exist to be called from inside
--    RLS policies, where the definer's rights are the point — nothing should
--    invoke them directly, and handle_new_user() is a trigger that must only
--    ever fire on auth.users insert.
--    Revoking from anon and authenticated is NOT enough on its own: Postgres
--    grants EXECUTE on functions to PUBLIC by default, so the privilege stays
--    reachable through that. Verified against production — the first pass
--    looked applied but has_function_privilege('anon', ...) still returned
--    true until PUBLIC was revoked too.
REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_vendor_id() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.next_booking_reference() FROM PUBLIC;

-- Revoking PUBLIC also stripped the roles that legitimately need these, so put
-- them back explicitly. supabase_auth_admin matters most: handle_new_user() is
-- the AFTER INSERT trigger on auth.users that creates the profile row, and it
-- held EXECUTE only via PUBLIC — without this grant, signup breaks.
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.next_booking_reference() TO service_role;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO service_role;
GRANT EXECUTE ON FUNCTION public.current_vendor_id() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- DELIBERATELY NOT DONE HERE: moving btree_gist out of the public schema.
--
-- The advisor flags it, but that extension backs the two EXCLUDE constraints
-- this product's correctness rests on — bookings_no_overlap (0009), which is
-- what makes double-booking impossible, and vehicle_blocks_no_overlap (0011).
-- ALTER EXTENSION ... SET SCHEMA changes where the gist operator classes live,
-- so it needs the constraints re-verified afterwards, not a blind migration on
-- a database with live bookings. Left for a maintenance window with a restore
-- point, tracked as part of DB-1.
