-- Seed data for the Karu MVP: 1 admin, 2 verified vendors, 1 test customer,
-- and 6 active cars across Douala / Yaoundé so the catalogue demos instantly.
--
-- Run against a dev/staging database (SQL editor or `psql -f`). Idempotent:
-- safe to re-run (ON CONFLICT DO NOTHING on every insert).
--
-- Auth users are created passwordless — real sign-in happens later via
-- password reset / magic link. The admin is promoted by email below.

-- 1. Auth users (the profiles trigger provisions public.profiles rows;
--    signup metadata role may only be customer/vendor — see migration 0013).
INSERT INTO auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'mnfalahahamad@gmail.com',         now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Falah Ahamad","locale":"en"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'ahamadfalah.fin@gmail.com',       now(), '{"provider":"email","providers":["email"]}', '{"role":"vendor","full_name":"Douala Prestige Rentals","locale":"fr"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'vendor-yaounde@seed.karuapp.com', now(), '{"provider":"email","providers":["email"]}', '{"role":"vendor","full_name":"Yaounde Auto Services","locale":"fr"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'ahamadfalah.dev@gmail.com',       now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Seed Customer","locale":"en"}', now(), now())
ON CONFLICT DO NOTHING;

-- GoTrue scans its token columns as non-null strings; rows inserted by SQL
-- leave them NULL, which 500s every sign-in ("Database error querying
-- schema") and even the password-reset flow. Blank them explicitly.
UPDATE auth.users SET
  confirmation_token         = COALESCE(confirmation_token, ''),
  recovery_token             = COALESCE(recovery_token, ''),
  email_change               = COALESCE(email_change, ''),
  email_change_token_new     = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  phone_change               = COALESCE(phone_change, ''),
  phone_change_token         = COALESCE(phone_change_token, ''),
  reauthentication_token     = COALESCE(reauthentication_token, '');

-- 2. Promote the team account to admin (signup can never grant this role).
UPDATE profiles SET role = 'admin'
WHERE id = (SELECT id FROM auth.users WHERE email = 'mnfalahahamad@gmail.com');

-- 3. Vendor rows — hand-vetted, so verified immediately.
-- Both deliver: airport meets are what diaspora customers ask for first.
INSERT INTO vendors (profile_id, business_name, city, contact_email, contact_phone, delivery_fee_xaf, airport_fee_xaf, status, verified_at)
SELECT u.id, v.business_name, v.city::city, u.email, v.phone, v.delivery_fee, v.airport_fee, 'verified', now()
FROM (VALUES
  ('ahamadfalah.fin@gmail.com',       'Douala Prestige Rentals', 'douala',  '+237 6 70 00 00 01', 5000, 10000),
  ('vendor-yaounde@seed.karuapp.com', 'Yaounde Auto Services',   'yaounde', '+237 6 70 00 00 02', 5000, 12000)
) AS v(email, business_name, city, phone, delivery_fee, airport_fee)
JOIN auth.users u ON u.email = v.email
ON CONFLICT (profile_id) DO NOTHING;

-- 4. Six active cars (photos attached later via the API).
-- Driver pricing is set per car: the C-Class is chauffeur-only (nobody rents
-- an executive saloon in Yaounde to drive themselves), the Swift and Hilux are
-- self-drive, the rest let the customer choose.
INSERT INTO vehicles (vendor_id, make, model, year, category, seats, transmission, daily_rate_xaf, driver_option, driver_daily_rate_xaf, city, pickup_locations, description, status)
SELECT ven.id, c.make, c.model, c.year, c.category::vehicle_category, c.seats, c.transmission::transmission, c.rate, c.driver::driver_option, c.driver_rate, c.city::city, c.pickups, c.description, 'active'
FROM (VALUES
  ('ahamadfalah.fin@gmail.com',  'Toyota',        'Corolla', 2019, 'sedan',   5, 'automatic', 35000, 'optional', 15000, 'douala',  ARRAY['Douala International Airport','Akwa'],   'Reliable, air-conditioned sedan. Ideal for city trips and airport pickups.'),
  ('ahamadfalah.fin@gmail.com',  'Toyota',        'RAV4',    2021, 'suv',     5, 'automatic', 55000, 'optional', 20000, 'douala',  ARRAY['Douala International Airport','Bonanjo'], 'Comfortable SUV, good clearance for out-of-town roads.'),
  ('ahamadfalah.fin@gmail.com',  'Suzuki',        'Swift',   2018, 'economy', 4, 'manual',    25000, 'none',      NULL, 'douala',  ARRAY['Akwa','Bonapriso'],                       'Economical city runabout. Cheapest way to get around Douala.'),
  ('vendor-yaounde@seed.karuapp.com', 'Toyota',        'Hilux',   2020, 'pickup',  5, 'manual',    65000, 'none',      NULL, 'yaounde', ARRAY['Yaounde Nsimalen Airport','Bastos'],      'Double-cab pickup, built for upcountry travel.'),
  ('vendor-yaounde@seed.karuapp.com', 'Mercedes-Benz', 'C-Class', 2019, 'luxury',  5, 'automatic', 85000, 'required', 20000, 'yaounde', ARRAY['Yaounde Nsimalen Airport','Hilton'],      'Executive saloon, chauffeur-driven. Business-ready.'),
  ('vendor-yaounde@seed.karuapp.com', 'Toyota',        'HiAce',   2019, 'van',    12, 'manual',    70000, 'optional', 20000, 'yaounde', ARRAY['Yaounde Nsimalen Airport'],               '12-seater van for groups and events.')
) AS c(vendor_email, make, model, year, category, seats, transmission, rate, driver, driver_rate, city, pickups, description)
JOIN auth.users u ON u.email = c.vendor_email
JOIN vendors ven ON ven.profile_id = u.id
WHERE NOT EXISTS (
  SELECT 1 FROM vehicles ex
  WHERE ex.vendor_id = ven.id AND ex.make = c.make AND ex.model = c.model
);
