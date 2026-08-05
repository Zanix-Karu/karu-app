-- Driver option and delivery.
--
-- Until now the schema could only express a self-drive rental collected from a
-- fixed pickup point. That is the exception in Douala and Yaounde, not the
-- rule: most cars here are rented *avec chauffeur*, and the diaspora demand
-- the MVP plan is built on — someone abroad booking for family — almost always
-- means "meet them at the airport", which had nowhere to live either.
--
-- Driver pricing sits on the vehicle (a given car may or may not come with a
-- driver, at its own rate). Delivery sits on the vendor: a rental business
-- either runs cars out to customers or it doesn't, and charging a different
-- delivery fee per car in the same fleet would be noise for the operator.

-- ── Driver: per vehicle ─────────────────────────────────────────────────────

create type driver_option as enum ('none', 'optional', 'required');

alter table vehicles
  add column driver_option driver_option not null default 'none',
  -- The daily cost of the driver, on top of the vehicle's own rate. Required
  -- whenever a driver can be had at all; meaningless otherwise.
  add column driver_daily_rate_xaf integer,
  add constraint vehicles_driver_rate_present check (
    (driver_option = 'none' and driver_daily_rate_xaf is null)
    or (driver_option <> 'none' and driver_daily_rate_xaf > 0)
  );

-- ── Delivery: per vendor ────────────────────────────────────────────────────

alter table vendors
  -- Delivery to an address the customer gives. Null fee = not offered.
  add column delivery_fee_xaf integer,
  -- Airport meet-and-greet, priced separately because it usually costs more
  -- (waiting time, parking) and because it is the diaspora's first question.
  add column airport_fee_xaf integer,
  add constraint vendors_delivery_fee_nonneg check (delivery_fee_xaf is null or delivery_fee_xaf >= 0),
  add constraint vendors_airport_fee_nonneg check (airport_fee_xaf is null or airport_fee_xaf >= 0);

-- ── Booking: what was actually chosen, and what it cost ─────────────────────

create type delivery_type as enum ('pickup_point', 'airport', 'address');

alter table bookings
  add column with_driver boolean not null default false,
  -- Snapshot of the driver cost for the whole rental, frozen at request time
  -- exactly like daily_rate_xaf, so a later price change cannot rewrite an
  -- agreed total.
  add column driver_fee_xaf integer not null default 0,
  add column delivery_type delivery_type not null default 'pickup_point',
  -- Where to bring the car (address delivery) or which terminal (airport).
  add column delivery_address text,
  add column delivery_fee_xaf integer not null default 0,
  -- When the customer wants the car. A flight lands at a time, not a date.
  add column pickup_time time,
  add constraint bookings_driver_fee_nonneg check (driver_fee_xaf >= 0),
  add constraint bookings_delivery_fee_nonneg check (delivery_fee_xaf >= 0),
  -- An address delivery without an address is not actionable by the driver.
  add constraint bookings_delivery_address_present check (
    delivery_type <> 'address' or (delivery_address is not null and length(trim(delivery_address)) > 0)
  );

comment on column bookings.driver_fee_xaf is
  'Driver cost for the whole rental (days x vehicle driver rate), frozen at request time.';
comment on column bookings.delivery_fee_xaf is
  'Delivery or airport fee, frozen at request time. Included in total_xaf.';

-- Existing seed rows: give the two verified providers realistic delivery
-- pricing and put a driver on the larger cars, so the feature is visible in
-- the catalogue immediately rather than on an empty state.
update vendors set delivery_fee_xaf = 5000, airport_fee_xaf = 10000 where status = 'verified';

update vehicles
   set driver_option = 'optional',
       driver_daily_rate_xaf = case
         when daily_rate_xaf >= 50000 then 20000
         else 15000
       end
 where category in ('suv', 'van', 'luxury', 'sedan');
