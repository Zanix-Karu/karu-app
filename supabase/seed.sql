-- Karu demo seed — a full marketplace to walk stakeholders through.
--
-- Covers the whole surface deliberately: every vendor verification state,
-- every booking status, both pricing paths (daily / weekly / monthly), both
-- delivery modes, self-drive and chauffeur, two-sided reviews, escrow payment
-- states, in-app chat (including a redacted message) and the email audit log.
--
-- Run with `supabase db reset` (local) or paste into the SQL editor / MCP
-- against a hosted project. Re-running is safe: every demo row lives in a
-- reserved UUID prefix which is deleted first, so a re-run refreshes the
-- dataset (dates are relative to CURRENT_DATE and stay fresh) and never
-- touches real accounts or bookings.
--
--   11111111- users / profiles     55555555- payments
--   22222222- vendors              66666666- reviews
--   33333333- vehicles             77777777- booking messages
--   44444444- bookings             88888888- vendor documents
--   99999999- vehicle blocks       aaaaaaaa- email log
--
-- Every demo account signs in with the same password, which is NOT committed.
-- Supply it as a psql setting when seeding a local stack:
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 \
--     -c "SET karu.demo_password = 'whatever-you-like';" -f supabase/seed.sql
--
-- If the setting is absent the accounts still seed, but with a random password
-- nobody knows — so running this file against a real environment by accident
-- cannot mint a working admin login. That is deliberate: the previous
-- hard-coded value shipped in git and those accounts, admin included, were
-- live on production.

-- ── 0. Clear previous demo data (FK order) ─────────────────────────────────
delete from reviews               where id::text        like '66666666-%';
delete from booking_message_reads where booking_id::text like '44444444-%';
delete from booking_messages      where id::text        like '77777777-%';
delete from email_log             where id::text        like 'aaaaaaaa-%';
delete from payments              where id::text        like '55555555-%';
delete from bookings              where id::text        like '44444444-%';
delete from vehicle_blocks        where id::text        like '99999999-%';
delete from vendor_documents      where id::text        like '88888888-%';
delete from vehicles              where id::text        like '33333333-%';
delete from vendors               where id::text        like '22222222-%';
delete from auth.users            where id::text        like '11111111-%';  -- cascades profiles

-- ── 1. Accounts ────────────────────────────────────────────────────────────
-- Created straight in auth.users with a bcrypt password so the demo is
-- sign-in-ready. GoTrue scans its token columns as non-null strings and 500s
-- on NULLs, so they are written as '' rather than left to default.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
select
  '00000000-0000-0000-0000-000000000000', u.id::uuid, 'authenticated', 'authenticated', u.email,
  extensions.crypt(
    coalesce(
      nullif(current_setting('karu.demo_password', true), ''),
      -- No setting: unusable-by-design random password (see header).
      encode(extensions.gen_random_bytes(24), 'hex')
    ),
    extensions.gen_salt('bf')
  ),
  now() - (u.age_days || ' days')::interval,
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', u.full_name, 'locale', u.locale)
    || case when u.role = 'vendor' then '{"role":"vendor"}'::jsonb else '{}'::jsonb end,
  now() - (u.age_days || ' days')::interval, now(),
  '', '', '', '', '', '', '', ''
from (values
  -- id                                      email                               full name                 role       loc   phone                  age
  ('11111111-0000-4000-8000-000000000001', 'admin@demo.getkaru.io',            'Karu Ops (Demo)',        'admin',    'en', '+237 6 99 00 00 01', 120),
  ('11111111-0000-4000-8000-000000000010', 'vendor.prestige@demo.getkaru.io',  'Éric Ndoumbé',           'vendor',   'fr', '+237 6 70 00 00 01', 110),
  ('11111111-0000-4000-8000-000000000011', 'vendor.yaounde@demo.getkaru.io',   'Pascal Owona',           'vendor',   'fr', '+237 6 70 00 00 02', 105),
  ('11111111-0000-4000-8000-000000000012', 'vendor.sawa@demo.getkaru.io',      'Blaise Ekwalla',         'vendor',   'en',  '+237 6 70 00 00 03',  64),
  ('11111111-0000-4000-8000-000000000013', 'vendor.bastos@demo.getkaru.io',    'Léonie Atangana',        'vendor',   'fr', '+237 6 70 00 00 04',   6),
  ('11111111-0000-4000-8000-000000000014', 'vendor.limbe@demo.getkaru.io',     'Samuel Efande',          'vendor',   'en',  '+237 6 70 00 00 05',  21),
  ('11111111-0000-4000-8000-000000000015', 'vendor.mboa@demo.getkaru.io',      'Rodrigue Tchouta',       'vendor',   'fr', '+237 6 70 00 00 06',  88),
  ('11111111-0000-4000-8000-000000000020', 'grace@demo.getkaru.io',            'Grace Nkemtaji',         'customer', 'en',  '+44 7700 900142',    40),
  ('11111111-0000-4000-8000-000000000021', 'jeanpaul@demo.getkaru.io',         'Jean-Paul Mbarga',       'customer', 'fr', '+237 6 55 11 22 33',  35),
  ('11111111-0000-4000-8000-000000000022', 'amina@demo.getkaru.io',            'Amina Bello',            'customer', 'en',  '+237 6 55 44 55 66',  33),
  ('11111111-0000-4000-8000-000000000023', 'serge@demo.getkaru.io',            'Serge Etoundi',          'customer', 'fr', '+237 6 55 77 88 99',  29),
  ('11111111-0000-4000-8000-000000000024', 'marie@demo.getkaru.io',            'Marie Fotso',            'customer', 'fr', '+237 6 55 12 34 56',  27),
  ('11111111-0000-4000-8000-000000000025', 'daniel@demo.getkaru.io',           'Daniel Achu',            'customer', 'en',  '+237 6 55 98 76 54',  19),
  ('11111111-0000-4000-8000-000000000026', 'clarisse@demo.getkaru.io',         'Clarisse Ngo',           'customer', 'fr', '+237 6 55 65 43 21',   1)
) as u(id, email, full_name, role, locale, phone, age_days);

-- The signup trigger provisions profiles but may only ever grant
-- customer/vendor (migration 0013), and never sees a phone we didn't put on
-- auth.users. Set the final shape here — this is also how admin is granted.
update profiles p set
  role      = v.role::user_role,
  full_name = v.full_name,
  phone     = v.phone,
  locale    = v.locale
from (values
  ('11111111-0000-4000-8000-000000000001', 'Karu Ops (Demo)',  'admin',    'en', '+237 6 99 00 00 01'),
  ('11111111-0000-4000-8000-000000000010', 'Éric Ndoumbé',     'vendor',   'fr', '+237 6 70 00 00 01'),
  ('11111111-0000-4000-8000-000000000011', 'Pascal Owona',     'vendor',   'fr', '+237 6 70 00 00 02'),
  ('11111111-0000-4000-8000-000000000012', 'Blaise Ekwalla',   'vendor',   'en', '+237 6 70 00 00 03'),
  ('11111111-0000-4000-8000-000000000013', 'Léonie Atangana',  'vendor',   'fr', '+237 6 70 00 00 04'),
  ('11111111-0000-4000-8000-000000000014', 'Samuel Efande',    'vendor',   'en', '+237 6 70 00 00 05'),
  ('11111111-0000-4000-8000-000000000015', 'Rodrigue Tchouta', 'vendor',   'fr', '+237 6 70 00 00 06'),
  ('11111111-0000-4000-8000-000000000020', 'Grace Nkemtaji',   'customer', 'en', '+44 7700 900142'),
  ('11111111-0000-4000-8000-000000000021', 'Jean-Paul Mbarga', 'customer', 'fr', '+237 6 55 11 22 33'),
  ('11111111-0000-4000-8000-000000000022', 'Amina Bello',      'customer', 'en', '+237 6 55 44 55 66'),
  ('11111111-0000-4000-8000-000000000023', 'Serge Etoundi',    'customer', 'fr', '+237 6 55 77 88 99'),
  ('11111111-0000-4000-8000-000000000024', 'Marie Fotso',      'customer', 'fr', '+237 6 55 12 34 56'),
  ('11111111-0000-4000-8000-000000000025', 'Daniel Achu',      'customer', 'en', '+237 6 55 98 76 54'),
  ('11111111-0000-4000-8000-000000000026', 'Clarisse Ngo',     'customer', 'fr', '+237 6 55 65 43 21')
) as v(id, full_name, role, locale, phone)
where p.id = v.id::uuid;

-- ── 2. Vendors — one of every verification state ───────────────────────────
-- Sawa Wheels is the informal operator (no RCCM, verified on a national ID)
-- that the onboarding spec expects to be the majority case; it also sells no
-- delivery at all, so the "pickup only" path is reachable from the catalogue.
insert into vendors (
  id, profile_id, business_name, rccm_number, city, contact_phone, contact_email,
  whatsapp_number, contact_person, address, status, verified_at,
  delivery_fee_xaf, airport_fee_xaf, declaration_accepted_at, created_at
)
select
  v.id::uuid, v.profile_id::uuid, v.business_name, v.rccm, v.city::city, v.phone, v.email,
  v.whatsapp, v.person, v.address, v.status::vendor_status,
  case when v.verified_days is null then null else now() - (v.verified_days || ' days')::interval end,
  v.delivery_fee, v.airport_fee,
  now() - (v.age_days || ' days')::interval,
  now() - (v.age_days || ' days')::interval
from (values
  ('22222222-0000-4000-8000-000000000010', '11111111-0000-4000-8000-000000000010', 'Douala Prestige Rentals', 'CM-DLA-2019-B-4821', 'douala',  '+237 6 70 00 00 01', 'vendor.prestige@demo.getkaru.io', '+237 6 70 00 00 01', 'Éric Ndoumbé',    'Rue Joss, Akwa, Douala',          'verified',  108,  5000, 10000, 110),
  ('22222222-0000-4000-8000-000000000011', '11111111-0000-4000-8000-000000000011', 'Yaoundé Auto Services',   'CM-YDE-2020-B-1174', 'yaounde', '+237 6 70 00 00 02', 'vendor.yaounde@demo.getkaru.io',  '+237 6 70 00 00 12', 'Pascal Owona',    'Avenue Kennedy, Yaoundé',         'verified',  103,  5000, 12000, 105),
  ('22222222-0000-4000-8000-000000000012', '11111111-0000-4000-8000-000000000012', 'Sawa Wheels',             null,                 'douala',  '+237 6 70 00 00 03', 'vendor.sawa@demo.getkaru.io',     '+237 6 70 00 00 03', 'Blaise Ekwalla',  'Bonapriso, Douala',               'verified',   60,  null,  null,  64),
  ('22222222-0000-4000-8000-000000000013', '11111111-0000-4000-8000-000000000013', 'Bastos Executive Cars',   'CM-YDE-2026-B-0932', 'yaounde', '+237 6 70 00 00 04', 'vendor.bastos@demo.getkaru.io',   '+237 6 70 00 00 04', 'Léonie Atangana', 'Bastos, Yaoundé',                 'pending',  null,  7000, 15000,   6),
  ('22222222-0000-4000-8000-000000000014', '11111111-0000-4000-8000-000000000014', 'Limbe Coastal Rides',     null,                 'other',   '+237 6 70 00 00 05', 'vendor.limbe@demo.getkaru.io',    '+237 6 70 00 00 05', 'Samuel Efande',   'Down Beach, Limbe',               'rejected', null,  null,  null,  21),
  ('22222222-0000-4000-8000-000000000015', '11111111-0000-4000-8000-000000000015', 'Mboa Car Hire',           'CM-DLA-2018-B-2210', 'douala',  '+237 6 70 00 00 06', 'vendor.mboa@demo.getkaru.io',     '+237 6 70 00 00 06', 'Rodrigue Tchouta','Boulevard de la Liberté, Douala', 'suspended',  86,  4000,  9000,  88)
) as v(id, profile_id, business_name, rccm, city, phone, email, whatsapp, person, address, status, verified_days, delivery_fee, airport_fee, age_days);

-- ── 3. Vehicles ────────────────────────────────────────────────────────────
-- Ten bookable cars across both cities and every category/price band, plus
-- five that deliberately are not bookable: two drafts behind an unverified
-- vendor, one behind a rejected vendor, and two deactivated when their owner
-- was suspended. Photos are stored as the ordered gallery plus the six
-- labelled angle slots the activation gate checks (0019) — the drafts are
-- short of the six on purpose, so "why can't I publish?" is demonstrable.
insert into vehicles (
  id, vendor_id, make, model, year, category, seats, transmission,
  daily_rate_xaf, driver_option, driver_daily_rate_xaf, weekly_rate_xaf, monthly_rate_xaf,
  city, pickup_locations, description, status, registration_number, fuel_type,
  photos, photo_angles, created_at
)
select
  c.id::uuid, c.vendor_id::uuid, c.make, c.model, c.year, c.category::vehicle_category,
  c.seats, c.transmission::transmission, c.daily, c.driver::driver_option, c.driver_rate,
  c.weekly, c.monthly, c.city::city, string_to_array(c.pickups, '|'), c.description,
  c.status::vehicle_status, c.plate, c.fuel::fuel_type,
  case
    when c.angles = 6 then array[(k.base || c.hero || k.q), (k.base || 'photo-1580273916550-e323be2ae537' || k.q), (k.base || 'photo-1502877338535-766e1452684a' || k.q), (k.base || 'photo-1449965408869-eaa3f722e40d' || k.q), (k.base || 'photo-1511919884226-fd3cad34687c' || k.q), (k.base || 'photo-1544636331-e26879cd4d9b' || k.q)]
    when c.angles = 2 then array[(k.base || c.hero || k.q), (k.base || 'photo-1552519507-88aa2dfa9fdb' || k.q)]
    when c.angles = 1 then array[(k.base || c.hero || k.q)]
    else '{}'::text[]
  end,
  case
    when c.angles = 6 then jsonb_build_object(
      'front', (k.base || c.hero || k.q),
      'rear',  (k.base || 'photo-1580273916550-e323be2ae537' || k.q),
      'left',  (k.base || 'photo-1502877338535-766e1452684a' || k.q),
      'right', (k.base || 'photo-1449965408869-eaa3f722e40d' || k.q),
      'dashboard', (k.base || 'photo-1511919884226-fd3cad34687c' || k.q),
      'seats', (k.base || 'photo-1544636331-e26879cd4d9b' || k.q))
    when c.angles = 2 then jsonb_build_object('front', (k.base || c.hero || k.q), 'rear', (k.base || 'photo-1552519507-88aa2dfa9fdb' || k.q))
    when c.angles = 1 then jsonb_build_object('front', (k.base || c.hero || k.q))
    else '{}'::jsonb
  end,
  now() - (c.age_days || ' days')::interval
from (values
  -- id                                      vendor                                  make            model             yr   category   st  trans        daily  driver      d_rate weekly   monthly   city      pickup locations                                  description                                                                              status     plate         fuel      hero                              ang age
  ('33333333-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000010', 'Toyota',        'Corolla',        2019, 'sedan',    5, 'automatic',  35000, 'optional',  15000, 210000,     null, 'douala',  'Douala International Airport|Akwa|Bonanjo',       'Reliable air-conditioned saloon. The default choice for city trips and airport runs.',   'active',   'LT 452 AB', 'petrol', 'photo-1550355291-bbee04a92027', 6, 108),
  ('33333333-0000-4000-8000-000000000002', '22222222-0000-4000-8000-000000000010', 'Toyota',        'RAV4',           2021, 'suv',      5, 'automatic',  55000, 'optional',  20000, 340000,  1300000, 'douala',  'Douala International Airport|Bonanjo',            'Comfortable SUV with the clearance for out-of-town roads. Weekly and monthly rates.',    'active',   'LT 771 CD', 'diesel', 'photo-1533473359331-0135ef1b58bf', 6, 106),
  ('33333333-0000-4000-8000-000000000003', '22222222-0000-4000-8000-000000000010', 'Suzuki',        'Swift',          2018, 'economy',  4, 'manual',     25000, 'none',       null,   null,     null, 'douala',  'Akwa|Bonapriso',                                 'Economical city runabout — the cheapest way to get around Douala.',                      'active',   'LT 118 EF', 'petrol', 'photo-1552519507-da3b142c6e3d', 6, 100),
  ('33333333-0000-4000-8000-000000000004', '22222222-0000-4000-8000-000000000010', 'Hyundai',       'Tucson',         2022, 'suv',      5, 'automatic',  60000, 'optional',  20000, 370000,  1400000, 'douala',  'Douala International Airport|Akwa',               'Newest car in the fleet. Set up for long stays — monthly rate for month-plus rentals.',  'active',   'LT 903 GH', 'diesel', 'photo-1568605117036-5fe5e7bab0b7', 6,  74),
  ('33333333-0000-4000-8000-000000000005', '22222222-0000-4000-8000-000000000011', 'Toyota',        'Hilux',          2020, 'pickup',   5, 'manual',     65000, 'none',       null, 400000,     null, 'yaounde', 'Yaounde Nsimalen Airport|Bastos',                'Double-cab pickup built for upcountry travel and site work.',                            'active',   'CE 210 JK', 'diesel', 'photo-1541899481282-d53bffe3c35d', 6, 102),
  ('33333333-0000-4000-8000-000000000006', '22222222-0000-4000-8000-000000000011', 'Mercedes-Benz', 'C-Class',        2019, 'luxury',   5, 'automatic',  85000, 'required',  20000,   null,     null, 'yaounde', 'Yaounde Nsimalen Airport|Hilton Yaounde',        'Executive saloon, chauffeur-driven only. Business-ready, meets at the airport.',         'active',   'CE 555 LM', 'petrol', 'photo-1503376780353-7e6692767b70', 6,  99),
  ('33333333-0000-4000-8000-000000000007', '22222222-0000-4000-8000-000000000011', 'Toyota',        'HiAce',          2019, 'van',     12, 'manual',     70000, 'optional',  20000, 430000,     null, 'yaounde', 'Yaounde Nsimalen Airport|Mvan',                  '12-seater van for groups, weddings and church events. Driver strongly recommended.',     'active',   'CE 088 NP', 'diesel', 'photo-1494976388531-d1058494cdd8', 6,  95),
  ('33333333-0000-4000-8000-000000000008', '22222222-0000-4000-8000-000000000011', 'Toyota',        'Yaris',          2020, 'economy',  5, 'manual',     28000, 'none',       null,   null,     null, 'yaounde', 'Bastos|Mvog-Mbi',                                'Small, frugal and easy to park in Yaounde traffic.',                                     'active',   'CE 342 QR', 'petrol', 'photo-1546614042-7df3c24c9e5d', 6,  70),
  ('33333333-0000-4000-8000-000000000009', '22222222-0000-4000-8000-000000000012', 'Toyota',        'Vitz',           2016, 'economy',  4, 'automatic',  22000, 'none',       null,   null,     null, 'douala',  'Bonapriso|Deido',                                'Cheapest car on Karu. Collected from the yard in Bonapriso — no delivery.',              'active',   'LT 660 ST', 'petrol', 'photo-1519641471654-76ce0107ad1b', 6,  58),
  ('33333333-0000-4000-8000-000000000010', '22222222-0000-4000-8000-000000000012', 'Nissan',        'X-Trail',        2017, 'suv',      5, 'automatic',  45000, 'optional',  15000,   null,     null, 'douala',  'Bonapriso',                                      'Well-kept family SUV. Driver available if you would rather not drive yourself.',         'active',   'LT 447 UV', 'petrol', 'photo-1583121274602-3e2820c69888', 6,  52),
  -- Not bookable, on purpose:
  ('33333333-0000-4000-8000-000000000011', '22222222-0000-4000-8000-000000000013', 'Toyota',        'Land Cruiser Prado', 2021, 'suv',  7, 'automatic',  95000, 'required',  25000,   null,     null, 'yaounde', 'Yaounde Nsimalen Airport|Bastos',                'Top-end 4x4 with driver. Awaiting Karu verification — 3 of 6 photos still missing.',     'draft',    'CE 900 WX', 'diesel', 'photo-1461632830798-3adb3034e4c8', 2,   5),
  ('33333333-0000-4000-8000-000000000012', '22222222-0000-4000-8000-000000000013', 'Kia',           'Rio',            2019, 'economy',  5, 'manual',     26000, 'none',       null,   null,     null, 'yaounde', 'Bastos',                                         'Second car of a vendor still in onboarding. Cannot be published yet.',                   'draft',    'CE 121 YZ', 'petrol', 'photo-1493238792000-8113da705763', 1,   4),
  ('33333333-0000-4000-8000-000000000013', '22222222-0000-4000-8000-000000000014', 'Toyota',        'Corolla',        2015, 'sedan',    5, 'manual',     30000, 'none',       null,   null,     null, 'other',   'Limbe Down Beach',                               'Listing frozen: the operator was rejected at verification (expired insurance).',         'draft',    'SW 305 AB', 'petrol', 'photo-1567808291548-fc3ee04dbcf0', 0,  20),
  ('33333333-0000-4000-8000-000000000014', '22222222-0000-4000-8000-000000000015', 'Honda',         'Fit',            2016, 'economy',  5, 'automatic',  24000, 'none',       null,   null,     null, 'douala',  'Bonaberi',                                       'Deactivated automatically when the owner was suspended over expired roadworthiness.',    'inactive', 'LT 512 CD', 'petrol', 'photo-1526726538690-5cbf956ae2fd', 1,  85),
  ('33333333-0000-4000-8000-000000000015', '22222222-0000-4000-8000-000000000015', 'Ford',          'Ranger',         2018, 'pickup',   5, 'manual',     60000, 'none',       null,   null,     null, 'douala',  'Bonaberi',                                       'Deactivated with the rest of the suspended fleet.',                                      'inactive', 'LT 288 EF', 'diesel', 'photo-1567808291548-fc3ee04dbcf0', 1,  84)
) as c(id, vendor_id, make, model, year, category, seats, transmission, daily, driver, driver_rate, weekly, monthly, city, pickups, description, status, plate, fuel, hero, angles, age_days)
-- CONTENT-1: these listings used Unsplash stock that did not match the car —
-- a "Toyota Vitz" led with a Honda CR-V in an Icelandic snowfield, and the
-- galleries showed a Ferrari and a Bugatti. An obvious placeholder reads
-- pre-launch; the wrong car reads dishonest. Swap `base` back to a real photo
-- host once launch vendors have supplied their own images.
cross join (select '/car-placeholder.svg#' as base, '' as q) k;

-- ── 4. Verification documents ──────────────────────────────────────────────
-- The admin console's review queue. Bastos Executive is the live case: four
-- documents sitting in 'pending', which is why its two cars cannot go live.
-- Sawa Wheels verifies on a national ID rather than an RCCM (the informal
-- operator branch), and Mboa's roadworthiness certificate has already lapsed
-- — the reason the whole fleet is suspended.
-- file_path points into the private vendor-documents bucket; the demo rows
-- describe paperwork that was never uploaded, so "download" will 404.
insert into vendor_documents (
  id, vendor_id, vehicle_id, type, file_path, status, reviewed_by, reviewed_at, notes, expires_at, created_at
)
select
  d.id::uuid, d.vendor_id::uuid, nullif(d.vehicle_id, '')::uuid, d.type::document_type, d.file_path,
  d.status::document_status,
  case when d.status = 'pending' then null else '11111111-0000-4000-8000-000000000001'::uuid end,
  case when d.status = 'pending' then null else now() - (d.reviewed_days || ' days')::interval end,
  nullif(d.notes, ''),
  case when d.expires_days is null then null else (current_date + d.expires_days) end,
  now() - (d.age_days || ' days')::interval
from (values
  -- Douala Prestige Rentals — registered business, fully approved
  ('88888888-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000010', '',                                     'rccm',           'vendors/prestige/rccm-cm-dla-2019-b-4821.pdf',   'approved', 108, '',                                                                                       null, 110),
  ('88888888-0000-4000-8000-000000000002', '22222222-0000-4000-8000-000000000010', '33333333-0000-4000-8000-000000000001', 'carte_grise',    'vendors/prestige/corolla-carte-grise.pdf',       'approved', 107, '',                                                                                       null, 108),
  ('88888888-0000-4000-8000-000000000003', '22222222-0000-4000-8000-000000000010', '33333333-0000-4000-8000-000000000001', 'insurance',      'vendors/prestige/corolla-assurance.pdf',         'approved', 107, '',                                                                                        120, 108),
  ('88888888-0000-4000-8000-000000000004', '22222222-0000-4000-8000-000000000010', '33333333-0000-4000-8000-000000000002', 'insurance',      'vendors/prestige/rav4-assurance.pdf',            'approved',  40, 'Renouvellement à demander avant expiration.',                                              45, 106),
  ('88888888-0000-4000-8000-000000000005', '22222222-0000-4000-8000-000000000010', '33333333-0000-4000-8000-000000000002', 'roadworthiness', 'vendors/prestige/rav4-visite-technique.pdf',     'approved',  40, '',                                                                                        200, 106),
  -- Yaoundé Auto Services — registered business, fully approved
  ('88888888-0000-4000-8000-000000000006', '22222222-0000-4000-8000-000000000011', '',                                     'rccm',           'vendors/yaounde/rccm-cm-yde-2020-b-1174.pdf',    'approved', 103, '',                                                                                       null, 105),
  ('88888888-0000-4000-8000-000000000007', '22222222-0000-4000-8000-000000000011', '33333333-0000-4000-8000-000000000005', 'insurance',      'vendors/yaounde/hilux-assurance.pdf',            'approved', 100, '',                                                                                         90, 102),
  ('88888888-0000-4000-8000-000000000008', '22222222-0000-4000-8000-000000000011', '33333333-0000-4000-8000-000000000006', 'roadworthiness', 'vendors/yaounde/cclass-visite-technique.pdf',    'approved',  96, '',                                                                                        150,  99),
  -- Sawa Wheels — informal operator, no RCCM, verified on a national ID
  ('88888888-0000-4000-8000-000000000009', '22222222-0000-4000-8000-000000000012', '',                                     'national_id',    'vendors/sawa/cni-ekwalla.jpg',                   'approved',  60, 'Opérateur non enregistré — vérifié sur pièce d''identité (CNI).',                        null,  64),
  ('88888888-0000-4000-8000-000000000010', '22222222-0000-4000-8000-000000000012', '33333333-0000-4000-8000-000000000009', 'insurance',      'vendors/sawa/vitz-assurance.pdf',                'approved',  58, '',                                                                                         60,  58),
  -- Bastos Executive Cars — PENDING: this is the admin review queue
  ('88888888-0000-4000-8000-000000000011', '22222222-0000-4000-8000-000000000013', '',                                     'rccm',           'vendors/bastos/rccm-cm-yde-2026-b-0932.pdf',     'pending',    0, '',                                                                                       null,   5),
  ('88888888-0000-4000-8000-000000000012', '22222222-0000-4000-8000-000000000013', '',                                     'national_id',    'vendors/bastos/cni-atangana.jpg',                'pending',    0, '',                                                                                       null,   5),
  ('88888888-0000-4000-8000-000000000013', '22222222-0000-4000-8000-000000000013', '33333333-0000-4000-8000-000000000011', 'carte_grise',    'vendors/bastos/prado-carte-grise.pdf',           'pending',    0, '',                                                                                       null,   4),
  ('88888888-0000-4000-8000-000000000014', '22222222-0000-4000-8000-000000000013', '33333333-0000-4000-8000-000000000011', 'insurance',      'vendors/bastos/prado-assurance.pdf',             'pending',    0, '',                                                                                        300,   4),
  -- Limbe Coastal Rides — REJECTED on an expired insurance certificate
  ('88888888-0000-4000-8000-000000000015', '22222222-0000-4000-8000-000000000014', '',                                     'national_id',    'vendors/limbe/cni-efande.jpg',                   'approved',  19, '',                                                                                       null,  21),
  ('88888888-0000-4000-8000-000000000016', '22222222-0000-4000-8000-000000000014', '33333333-0000-4000-8000-000000000013', 'insurance',      'vendors/limbe/corolla-assurance.pdf',            'rejected',  18, 'Attestation expirée. Merci de renvoyer une police en cours de validité.',                  -60,  21),
  -- Mboa Car Hire — SUSPENDED: roadworthiness lapsed twelve days ago
  ('88888888-0000-4000-8000-000000000017', '22222222-0000-4000-8000-000000000015', '',                                     'rccm',           'vendors/mboa/rccm-cm-dla-2018-b-2210.pdf',       'approved',  86, '',                                                                                       null,  88),
  ('88888888-0000-4000-8000-000000000018', '22222222-0000-4000-8000-000000000015', '33333333-0000-4000-8000-000000000014', 'roadworthiness', 'vendors/mboa/fit-visite-technique.pdf',          'approved',  80, 'Expirée — fournisseur suspendu jusqu''à renouvellement.',                                  -12,  85)
) as d(id, vendor_id, vehicle_id, type, file_path, status, reviewed_days, notes, expires_days, age_days);

-- ── 5. Manual unavailability ───────────────────────────────────────────────
-- Dates a car is off the market for reasons that are not a booking. The Yaris
-- window spans today, so it shows as unavailable in the vendor's fleet stats.
insert into vehicle_blocks (id, vehicle_id, start_date, end_date, reason, created_by, created_at)
select b.id::uuid, b.vehicle_id::uuid, current_date + b.d_start, current_date + b.d_end, b.reason,
       b.created_by::uuid, now() - (b.age_days || ' days')::interval
from (values
  ('99999999-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000002',  3,  6, 'Entretien programmé — révision 40 000 km', '11111111-0000-4000-8000-000000000010', 4),
  ('99999999-0000-4000-8000-000000000002', '33333333-0000-4000-8000-000000000005', 25, 28, 'Usage privé du propriétaire',              '11111111-0000-4000-8000-000000000011', 2),
  ('99999999-0000-4000-8000-000000000003', '33333333-0000-4000-8000-000000000008', -2,  1, 'Carrosserie — retouche pare-chocs',        '11111111-0000-4000-8000-000000000011', 3)
) as b(id, vehicle_id, d_start, d_end, reason, created_by, age_days);

-- ── 6. Bookings — every status, both pricing paths, both delivery modes ────
-- Totals are computed here the way `quoteBooking` in @karu/shared computes
-- them (greedy monthly → weekly → daily, never worse than plain daily × days,
-- plus driver × days and the vendor's delivery or airport fee), so what the
-- demo shows reconciles with what the API would have produced. Deposit is the
-- same 15% the booking flow charges.
--
-- Dates are relative to today, and none of the confirmed/in_progress rows
-- overlap on a vehicle — the 0009 exclusion constraint would reject them.
insert into bookings (
  id, vehicle_id, customer_id, vendor_id, start_date, end_date, pickup_location, status,
  daily_rate_xaf, total_xaf, deposit_xaf, currency, customer_note, vendor_note,
  with_driver, driver_fee_xaf, delivery_type, delivery_address, delivery_fee_xaf, pickup_time,
  reference, requested_at, confirmed_at, created_at, updated_at
)
with spec(id, vehicle_id, customer_id, d_start, d_end, with_driver, delivery_type, delivery_address,
          pickup_location, pickup_time, status, customer_note, vendor_note,
          created_days, confirm_hours, seq) as (values
  -- Live demand: a request the vendor has not answered yet
  ('44444444-0000-4000-8000-000000000001','33333333-0000-4000-8000-000000000002','11111111-0000-4000-8000-000000000020', 14, 20, true,  'airport', 'Douala International Airport — Air France AF870, arrivée 18:40', null, '18:40', 'requested', 'My parents land on the 18:40 from Paris. Please have the driver meet them inside the terminal with a name board.', null, 1, null, 1),
  ('44444444-0000-4000-8000-000000000013','33333333-0000-4000-8000-000000000010','11111111-0000-4000-8000-000000000024', 21, 25, false, 'pickup_point', null, 'Bonapriso', null, 'requested', 'Je passe récupérer la voiture le matin si possible.', null, 0, null, 13),
  -- Confirmed and upcoming
  ('44444444-0000-4000-8000-000000000002','33333333-0000-4000-8000-000000000006','11111111-0000-4000-8000-000000000021',  5,  7, true,  'pickup_point', null, 'Hilton Yaounde', '08:00', 'confirmed', 'Mission de trois jours, chauffeur en costume svp.', 'Chauffeur: M. Owona. Véhicule prêt à 08h à l''hôtel.', 3, 2, 2),
  ('44444444-0000-4000-8000-000000000014','33333333-0000-4000-8000-000000000005','11111111-0000-4000-8000-000000000022',  8, 14, false, 'pickup_point', null, 'Yaounde Nsimalen Airport', null, 'confirmed', 'Field trip to the North West — will keep it a full week.', 'Full tank on collection, spare tyre checked.', 4, 2, 14),
  ('44444444-0000-4000-8000-000000000015','33333333-0000-4000-8000-000000000009','11111111-0000-4000-8000-000000000020', 30, 34, false, 'pickup_point', null, 'Bonapriso', null, 'confirmed', 'Booking ahead of my trip home next month.', 'Réservé. Merci.', 2, 1, 15),
  -- Underway right now
  ('44444444-0000-4000-8000-000000000003','33333333-0000-4000-8000-000000000007','11111111-0000-4000-8000-000000000023', -1,  2, true,  'address', 'Palais des Congrès, Yaoundé', null, '07:30', 'in_progress', 'Transport des invités pour le mariage — 11 personnes.', 'Chauffeur Alphonse, +237 6 xx — coordonnées échangées via la messagerie Karu.', 8, 5, 3),
  -- Finished trips: these drive the ratings and the 30-day earnings chart
  ('44444444-0000-4000-8000-000000000004','33333333-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000024',-24,-21, false, 'pickup_point', null, 'Akwa', null, 'completed', 'Weekend à Kribi.', null, 25, 3, 4),
  ('44444444-0000-4000-8000-000000000005','33333333-0000-4000-8000-000000000004','11111111-0000-4000-8000-000000000022',-27, -6, false, 'address', 'Bonanjo, Douala — bureau ONG, rue Gallieni', null, null, 'completed', 'Three-week programme visit. Please deliver to the office on the first morning.', 'Livrée à 08h. Tarif hebdomadaire appliqué.', 28, 6, 5),
  ('44444444-0000-4000-8000-000000000006','33333333-0000-4000-8000-000000000003','11111111-0000-4000-8000-000000000024',-17,-15, false, 'pickup_point', null, 'Akwa', null, 'completed', null, null, 18, 1, 6),
  ('44444444-0000-4000-8000-000000000007','33333333-0000-4000-8000-000000000002','11111111-0000-4000-8000-000000000020',-11, -8, true,  'airport', 'Douala International Airport — Brussels Airlines SN357, 19:05', null, '19:05', 'completed', 'Family arriving for a funeral. Driver for the whole stay.', 'Chauffeur Désiré. Vol suivi, attente incluse.', 12, 2, 7),
  ('44444444-0000-4000-8000-000000000008','33333333-0000-4000-8000-000000000006','11111111-0000-4000-8000-000000000021', -8, -7, true,  'pickup_point', null, 'Yaounde Nsimalen Airport', '06:15', 'completed', 'Aller-retour Douala dans la journée.', null, 9, 4, 8),
  ('44444444-0000-4000-8000-000000000009','33333333-0000-4000-8000-000000000009','11111111-0000-4000-8000-000000000025', -5, -3, false, 'pickup_point', null, 'Deido', null, 'completed', 'Just need something cheap for three days.', null, 6, 2, 9),
  ('44444444-0000-4000-8000-000000000010','33333333-0000-4000-8000-000000000005','11111111-0000-4000-8000-000000000023',-19,-16, false, 'pickup_point', null, 'Bastos', null, 'completed', 'Chantier à Ebolowa.', 'Désolé pour le délai de réponse.', 20, 30, 10),
  -- Declined and cancelled
  ('44444444-0000-4000-8000-000000000011','33333333-0000-4000-8000-000000000006','11111111-0000-4000-8000-000000000025',  3,  4, true,  'pickup_point', null, 'Hilton Yaounde', null, 'rejected', 'Need the Mercedes for a client pickup.', 'Véhicule déjà engagé pour un mariage ce week-end. Nous pouvons proposer la Hilux avec chauffeur.', 2, 4, 11),
  ('44444444-0000-4000-8000-000000000012','33333333-0000-4000-8000-000000000008','11111111-0000-4000-8000-000000000025', 10, 12, false, 'pickup_point', null, 'Bastos', null, 'cancelled', 'Trip called off — my meeting moved to Douala. Sorry for the late notice.', null, 5, 3, 12)
),
joined as (
  select s.*, v.vendor_id, v.daily_rate_xaf, v.weekly_rate_xaf, v.monthly_rate_xaf,
         v.driver_daily_rate_xaf, ven.delivery_fee_xaf as ven_delivery, ven.airport_fee_xaf as ven_airport,
         (s.d_end - s.d_start + 1) as days,
         now() - (s.created_days || ' days')::interval as created_ts
  from spec s
  join vehicles v on v.id = s.vehicle_id::uuid
  join vendors ven on ven.id = v.vendor_id
),
parts as (
  select j.*,
         case when j.monthly_rate_xaf is not null then j.days / 30 else 0 end as n_months
  from joined j
),
parts2 as (
  select p.*,
         case when p.weekly_rate_xaf is not null then (p.days - p.n_months * 30) / 7 else 0 end as n_weeks
  from parts p
),
money as (
  select p.*,
         least(
           p.n_months * coalesce(p.monthly_rate_xaf, 0)
             + p.n_weeks * coalesce(p.weekly_rate_xaf, 0)
             + (p.days - p.n_months * 30 - p.n_weeks * 7) * p.daily_rate_xaf,
           p.days * p.daily_rate_xaf
         ) as vehicle_xaf,
         case when p.with_driver then coalesce(p.driver_daily_rate_xaf, 0) * p.days else 0 end as driver_xaf,
         case p.delivery_type
           when 'airport' then coalesce(p.ven_airport, 0)
           when 'address' then coalesce(p.ven_delivery, 0)
           else 0
         end as delivery_xaf
  from parts2 p
)
select
  m.id::uuid, m.vehicle_id::uuid, m.customer_id::uuid, m.vendor_id,
  current_date + m.d_start, current_date + m.d_end, m.pickup_location, m.status::booking_status,
  m.daily_rate_xaf,
  m.vehicle_xaf + m.driver_xaf + m.delivery_xaf,
  ceil((m.vehicle_xaf + m.driver_xaf + m.delivery_xaf) * 0.15)::int,
  'XAF', m.customer_note, m.vendor_note,
  m.with_driver, m.driver_xaf, m.delivery_type::delivery_type, m.delivery_address, m.delivery_xaf,
  m.pickup_time::time,
  'KARU-' || to_char(m.created_ts, 'YYYYMMDD') || '-' || lpad(m.seq::text, 4, '0'),
  m.created_ts,
  case when m.confirm_hours is null then null else m.created_ts + (m.confirm_hours || ' hours')::interval end,
  m.created_ts,
  coalesce(m.created_ts + (m.confirm_hours || ' hours')::interval, m.created_ts)
from money m;

-- ── 7. Payments — the escrow states ────────────────────────────────────────
-- One row per booking that got as far as taking money, for the 15% deposit.
-- Providers are mixed on purpose: 'card' is the MVP path, MoMo/Orange are the
-- Cameroon rails, 'manual' is a transfer the team recorded by hand.
insert into payments (id, booking_id, provider, amount_xaf, status, provider_ref, created_at, updated_at)
select p.id::uuid, p.booking_id::uuid, p.provider::payment_provider, b.deposit_xaf,
       p.status::payment_status, nullif(p.ref, ''), b.created_at, b.updated_at
from (values
  ('55555555-0000-4000-8000-000000000001','44444444-0000-4000-8000-000000000001','card',        'pending',  'pi_demo_3xK1aQ7bN'),
  ('55555555-0000-4000-8000-000000000002','44444444-0000-4000-8000-000000000002','card',        'held',     'pi_demo_9fT2mR4cV'),
  ('55555555-0000-4000-8000-000000000003','44444444-0000-4000-8000-000000000003','card',        'held',     'pi_demo_5hW8pL1dZ'),
  ('55555555-0000-4000-8000-000000000004','44444444-0000-4000-8000-000000000004','card',        'released', 'pi_demo_2bC6xN9kQ'),
  ('55555555-0000-4000-8000-000000000005','44444444-0000-4000-8000-000000000005','card',        'released', 'pi_demo_7dV3zM5tR'),
  ('55555555-0000-4000-8000-000000000006','44444444-0000-4000-8000-000000000006','mtn_momo',    'released', 'MP260812.1432.A47219'),
  ('55555555-0000-4000-8000-000000000007','44444444-0000-4000-8000-000000000007','card',        'released', 'pi_demo_4kL9wS2vB'),
  ('55555555-0000-4000-8000-000000000008','44444444-0000-4000-8000-000000000008','orange_money','released', 'OM260819.0907.C81044'),
  ('55555555-0000-4000-8000-000000000009','44444444-0000-4000-8000-000000000009','mtn_momo',    'released', 'MP260822.1801.B93307'),
  ('55555555-0000-4000-8000-000000000010','44444444-0000-4000-8000-000000000010','manual',      'released', 'Virement bancaire — reçu n°4471'),
  ('55555555-0000-4000-8000-000000000012','44444444-0000-4000-8000-000000000012','card',        'refunded', 'pi_demo_8mN4qT7yF'),
  ('55555555-0000-4000-8000-000000000013','44444444-0000-4000-8000-000000000013','mtn_momo',    'failed',   'MP260828.0912.F00218'),
  ('55555555-0000-4000-8000-000000000014','44444444-0000-4000-8000-000000000014','orange_money','held',     'OM260824.1615.D22190'),
  ('55555555-0000-4000-8000-000000000015','44444444-0000-4000-8000-000000000015','card',        'pending',  'pi_demo_6pR1kJ8xW')
) as p(id, booking_id, provider, status, ref)
join bookings b on b.id = p.booking_id::uuid;

-- ── 8. Reviews — two-sided, on completed bookings only ─────────────────────
-- target='vendor' is the customer rating the operator; target='customer' is
-- the operator rating the renter. The 3-star on the Hilux is deliberate: a
-- catalogue where every rating is five stars tells a stakeholder nothing.
insert into reviews (id, booking_id, author_id, target, rating, comment, created_at)
select r.id::uuid, r.booking_id::uuid, r.author_id::uuid, r.target::review_target, r.rating,
       r.comment, b.end_date + time '18:00' + (r.hours_after || ' hours')::interval
from (values
  ('66666666-0000-4000-8000-000000000001','44444444-0000-4000-8000-000000000004','11111111-0000-4000-8000-000000000024','vendor',   5, 'Voiture impeccable et propre, récupération rapide à Akwa. Je réserverai à nouveau.', 6),
  ('66666666-0000-4000-8000-000000000002','44444444-0000-4000-8000-000000000004','11111111-0000-4000-8000-000000000010','customer', 5, 'Cliente sérieuse, véhicule rendu à l''heure et en bon état.', 20),
  ('66666666-0000-4000-8000-000000000003','44444444-0000-4000-8000-000000000005','11111111-0000-4000-8000-000000000022','vendor',   4, 'Delivered to the office on time every morning of the handover. Aircon struggled in traffic but the car did three weeks without a problem.', 8),
  ('66666666-0000-4000-8000-000000000004','44444444-0000-4000-8000-000000000006','11111111-0000-4000-8000-000000000024','vendor',   5, 'Parfait pour circuler en ville, et le prix est imbattable.', 5),
  ('66666666-0000-4000-8000-000000000005','44444444-0000-4000-8000-000000000007','11111111-0000-4000-8000-000000000020','vendor',   5, 'The driver was inside the terminal with a name board when my parents landed. That is exactly what I was paying for from London.', 10),
  ('66666666-0000-4000-8000-000000000006','44444444-0000-4000-8000-000000000007','11111111-0000-4000-8000-000000000010','customer', 5, 'Réservation claire, communication parfaite.', 26),
  ('66666666-0000-4000-8000-000000000007','44444444-0000-4000-8000-000000000008','11111111-0000-4000-8000-000000000021','vendor',   4, 'Chauffeur ponctuel et discret. La voiture mériterait un nettoyage intérieur plus soigné.', 7),
  ('66666666-0000-4000-8000-000000000008','44444444-0000-4000-8000-000000000008','11111111-0000-4000-8000-000000000011','customer', 5, 'Client régulier, aucun souci.', 30),
  ('66666666-0000-4000-8000-000000000009','44444444-0000-4000-8000-000000000009','11111111-0000-4000-8000-000000000025','vendor',   4, 'Cheap, honest, no surprises. Pickup yard is a bit hard to find the first time.', 9),
  ('66666666-0000-4000-8000-000000000010','44444444-0000-4000-8000-000000000010','11111111-0000-4000-8000-000000000023','vendor',   3, 'Le pick-up a bien fait le travail, mais il a fallu plus d''une journée pour avoir une réponse à ma demande.', 12)
) as r(id, booking_id, author_id, target, rating, comment, hours_after)
join bookings b on b.id = r.booking_id::uuid;

-- ── 9. In-app messages ─────────────────────────────────────────────────────
-- The customer↔vendor channel. Contact details never cross the platform: the
-- API strips them before storing and sets `redacted`, which is what the
-- flagged message on the wedding booking demonstrates. Admins see every thread.
insert into booking_messages (id, booking_id, sender_id, sender_role, body, redacted, created_at)
select m.id::uuid, m.booking_id::uuid, m.sender_id::uuid, m.sender_role::user_role, m.body, m.redacted,
       b.created_at + (m.mins_after || ' minutes')::interval
from (values
  -- Awaiting the vendor's decision
  ('77777777-0000-4000-8000-000000000001','44444444-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000020','customer','Hello — I am booking from London for my parents. They land on the 18:40 from Paris. Can your driver wait inside the terminal?', false, 20),
  ('77777777-0000-4000-8000-000000000002','44444444-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000010','vendor',  'Bonjour, oui, accueil en salle d''arrivée avec pancarte. Pouvez-vous confirmer le numéro de vol et le nombre de bagages ?', false, 95),
  ('77777777-0000-4000-8000-000000000003','44444444-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000020','customer','AF870. Two large suitcases and two carry-ons, so the boot needs to be clear.', false, 140),
  -- Confirmed, chauffeur job
  ('77777777-0000-4000-8000-000000000004','44444444-0000-4000-8000-000000000002','11111111-0000-4000-8000-000000000021','customer','Bonjour, le chauffeur peut-il être à l''hôtel à 08h précises lundi ? J''ai une réunion à 09h.', false, 30),
  ('77777777-0000-4000-8000-000000000005','44444444-0000-4000-8000-000000000002','11111111-0000-4000-8000-000000000011','vendor',  'Bonjour Monsieur Mbarga. C''est noté : 08h00 devant le Hilton, chauffeur en costume. Le véhicule sera lavé la veille.', false, 165),
  ('77777777-0000-4000-8000-000000000006','44444444-0000-4000-8000-000000000002','11111111-0000-4000-8000-000000000021','customer','Parfait, merci.', false, 200),
  -- Underway — includes a message the API redacted
  ('77777777-0000-4000-8000-000000000007','44444444-0000-4000-8000-000000000003','11111111-0000-4000-8000-000000000023','customer','Bonjour, nous serons 11 personnes plus le matériel de sono. Le HiAce peut-il tout prendre ?', false, 25),
  ('77777777-0000-4000-8000-000000000008','44444444-0000-4000-8000-000000000003','11111111-0000-4000-8000-000000000011','vendor',  'Oui sans problème, la banquette arrière se replie. Le chauffeur sera sur place à 07h30.', false, 90),
  ('77777777-0000-4000-8000-000000000009','44444444-0000-4000-8000-000000000003','11111111-0000-4000-8000-000000000023','customer','Merci. Dites-lui de m''appeler au [contact masqué] en arrivant, je serai devant le portail.', true, 300),
  ('77777777-0000-4000-8000-000000000010','44444444-0000-4000-8000-000000000003','11111111-0000-4000-8000-000000000001','admin',   'Karu ici : merci de garder les échanges sur la plateforme. Le chauffeur vous contactera via cette messagerie à son arrivée.', false, 340),
  -- A finished trip, kept for the archive view
  ('77777777-0000-4000-8000-000000000011','44444444-0000-4000-8000-000000000005','11111111-0000-4000-8000-000000000022','customer','Could you deliver to the Bonanjo office at 8am on the first day rather than the airport?', false, 45),
  ('77777777-0000-4000-8000-000000000012','44444444-0000-4000-8000-000000000005','11111111-0000-4000-8000-000000000010','vendor',  'Bien reçu, livraison à Bonanjo à 08h. Frais de livraison inclus dans le devis.', false, 130)
) as m(id, booking_id, sender_id, sender_role, body, redacted, mins_after)
join bookings b on b.id = m.booking_id::uuid;

-- Read cursors: the vendor has not opened the airport request, so it shows
-- unread; the other two threads are caught up.
insert into booking_message_reads (booking_id, profile_id, last_read_at)
select r.booking_id::uuid, r.profile_id::uuid, b.created_at + (r.mins || ' minutes')::interval
from (values
  ('44444444-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000020', 145),
  ('44444444-0000-4000-8000-000000000001','11111111-0000-4000-8000-000000000010', 100),
  ('44444444-0000-4000-8000-000000000002','11111111-0000-4000-8000-000000000021', 210),
  ('44444444-0000-4000-8000-000000000002','11111111-0000-4000-8000-000000000011', 210),
  ('44444444-0000-4000-8000-000000000003','11111111-0000-4000-8000-000000000023', 350)
) as r(booking_id, profile_id, mins)
join bookings b on b.id = r.booking_id::uuid
on conflict (booking_id, profile_id) do update set last_read_at = excluded.last_read_at;

-- ── 10. Transactional email audit ──────────────────────────────────────────
-- What the API recorded when it notified the parties. Two failures are kept in
-- so the "email failure never rolls back a booking" behaviour is visible.
insert into email_log (id, booking_id, recipient, template, locale, provider_id, status, error, created_at)
select e.id::uuid, e.booking_id::uuid, e.recipient, e.template, e.locale, nullif(e.provider_id, ''),
       e.status, nullif(e.error, ''), b.created_at + (e.mins || ' minutes')::interval
from (values
  ('aaaaaaaa-0000-4000-8000-000000000001','44444444-0000-4000-8000-000000000001','grace@demo.getkaru.io',           'booking_requested_customer','en','re_demo_a41f9', 'sent',  '', 1),
  ('aaaaaaaa-0000-4000-8000-000000000002','44444444-0000-4000-8000-000000000001','vendor.prestige@demo.getkaru.io', 'booking_requested_vendor',  'fr','re_demo_b72c4', 'sent',  '', 1),
  ('aaaaaaaa-0000-4000-8000-000000000003','44444444-0000-4000-8000-000000000002','jeanpaul@demo.getkaru.io',        'booking_requested_customer','fr','re_demo_c18e7', 'sent',  '', 1),
  ('aaaaaaaa-0000-4000-8000-000000000004','44444444-0000-4000-8000-000000000002','jeanpaul@demo.getkaru.io',        'booking_confirmed',         'fr','re_demo_d93a1', 'sent',  '', 121),
  ('aaaaaaaa-0000-4000-8000-000000000005','44444444-0000-4000-8000-000000000003','serge@demo.getkaru.io',           'booking_confirmed',         'fr','re_demo_e55b8', 'sent',  '', 301),
  ('aaaaaaaa-0000-4000-8000-000000000006','44444444-0000-4000-8000-000000000007','grace@demo.getkaru.io',           'booking_confirmed',         'en','re_demo_f27d3', 'sent',  '', 121),
  ('aaaaaaaa-0000-4000-8000-000000000007','44444444-0000-4000-8000-000000000011','daniel@demo.getkaru.io',          'booking_rejected',          'en','re_demo_a88f2', 'sent',  '', 241),
  ('aaaaaaaa-0000-4000-8000-000000000008','44444444-0000-4000-8000-000000000012','daniel@demo.getkaru.io',          'booking_cancelled',         'en','',              'failed','Resend 403: the domain getkaru.io is not verified for this API key', 181),
  ('aaaaaaaa-0000-4000-8000-000000000009','44444444-0000-4000-8000-000000000013','vendor.sawa@demo.getkaru.io',     'booking_requested_vendor',  'en','',              'failed','Resend 429: rate limit exceeded, retry scheduled', 2),
  ('aaaaaaaa-0000-4000-8000-000000000010','44444444-0000-4000-8000-000000000014','amina@demo.getkaru.io',           'booking_confirmed',         'en','re_demo_c04e9', 'sent',  '', 121)
) as e(id, booking_id, recipient, template, locale, provider_id, status, error, mins)
join bookings b on b.id = e.booking_id::uuid;
