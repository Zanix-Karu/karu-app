-- 0020: Close the public hole on booking_counters.
--
-- 0010 created this table without RLS, and 0015's blanket grants then handed
-- `anon` and `authenticated` access to it along with every other table. Because
-- the anon key ships inside the web bundle, the counter feeding
-- next_booking_reference() was readable — and writable — by anyone on the
-- internet. It was the only table in `public` with RLS disabled.
--
-- Nothing client-side needs it: the sole caller is the NestJS API, which
-- connects as `service_role` (bypasses RLS, keeps its 0015 grant). So the fix
-- is to close it entirely rather than write a policy — RLS on with no policies
-- means no end-user JWT can touch the table, matching the defence-in-depth
-- stance already taken for vehicle_blocks in 0011 and email_log in 0008.

ALTER TABLE public.booking_counters ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.booking_counters FROM anon, authenticated;

-- next_booking_reference() is SECURITY INVOKER, so revoking the table grants
-- above already stops an end-user JWT from minting references. Revoking EXECUTE
-- too removes the RPC from the PostgREST surface entirely: booking references
-- are issued by the API when a booking is created, never on request.
REVOKE EXECUTE ON FUNCTION public.next_booking_reference() FROM anon, authenticated;
