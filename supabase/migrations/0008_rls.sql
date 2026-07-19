-- 0008: Row Level Security
-- The NestJS API talks to Postgres with the service_role key, which BYPASSES
-- RLS — Nest is the real authorization layer. These policies are defense in
-- depth: if any client ever connects with an end-user JWT (e.g. a future
-- direct-to-Supabase mobile path, or Supabase Storage signed access), the DB
-- still refuses to leak data. Default posture: deny, then open the minimum.

-- Helper: current user's role, read from their profile.
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS user_role AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper: vendor row owned by the current user, if any.
CREATE OR REPLACE FUNCTION current_vendor_id()
RETURNS uuid AS $$
  SELECT id FROM public.vendors WHERE profile_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

ALTER TABLE profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors          ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews          ENABLE ROW LEVEL SECURITY;

-- profiles: a user can see and edit only their own profile.
CREATE POLICY profiles_self_select ON profiles
  FOR SELECT USING (id = auth.uid());
CREATE POLICY profiles_self_update ON profiles
  FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- vendors: a vendor sees/edits their own record; verified vendors are
-- publicly visible (so customers can see who they're renting from).
CREATE POLICY vendors_self_all ON vendors
  FOR ALL USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());
CREATE POLICY vendors_public_verified ON vendors
  FOR SELECT USING (status = 'verified');

-- vendor_documents: strictly private to the owning vendor.
CREATE POLICY vendor_documents_owner ON vendor_documents
  FOR ALL USING (vendor_id = current_vendor_id())
  WITH CHECK (vendor_id = current_vendor_id());

-- vehicles: active vehicles are public; a vendor manages their own.
CREATE POLICY vehicles_public_active ON vehicles
  FOR SELECT USING (status = 'active');
CREATE POLICY vehicles_owner_all ON vehicles
  FOR ALL USING (vendor_id = current_vendor_id())
  WITH CHECK (vendor_id = current_vendor_id());

-- bookings: visible to the customer who made it and the vendor who owns the car.
CREATE POLICY bookings_customer ON bookings
  FOR ALL USING (customer_id = auth.uid()) WITH CHECK (customer_id = auth.uid());
CREATE POLICY bookings_vendor_select ON bookings
  FOR SELECT USING (vendor_id = current_vendor_id());

-- payments: visible to the two parties of the underlying booking.
CREATE POLICY payments_parties ON payments
  FOR SELECT USING (
    booking_id IN (
      SELECT id FROM bookings
      WHERE customer_id = auth.uid() OR vendor_id = current_vendor_id()
    )
  );

-- reviews: anyone can read (public reputation); only the author writes.
CREATE POLICY reviews_public_select ON reviews
  FOR SELECT USING (true);
CREATE POLICY reviews_author_insert ON reviews
  FOR INSERT WITH CHECK (author_id = auth.uid());
