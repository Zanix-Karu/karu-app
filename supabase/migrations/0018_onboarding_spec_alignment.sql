-- 0018: Vendor-onboarding spec alignment (Phase 1 pilot doc).
--
-- The onboarding requirements name fields the schema never had: identity
-- documents for the (majority) informal operators who have no RCCM, documents
-- scoped to the vehicle they belong to, expiry dates so "suspend on expired
-- documents" is enforceable, WhatsApp/address/contact-person on the vendor,
-- and plate / fuel type / weekly-monthly pricing on the vehicle.

-- ── Documents: identity types, per-vehicle scope, expiry ────────────────────

-- Informal operators verify with a person's ID, not a business registration.
-- (PG12+ allows ADD VALUE in a transaction as long as the same transaction
-- doesn't *use* the value — nothing below references these two.)
alter type document_type add value if not exists 'national_id';
alter type document_type add value if not exists 'passport';

alter table vendor_documents
  -- A carte grise / insurance / roadworthiness certificate belongs to one
  -- car, not to the fleet. Null = vendor-scoped (RCCM, identity documents,
  -- and any paperwork filed before this migration).
  add column vehicle_id uuid references vehicles(id) on delete cascade,
  -- Insurance and roadworthiness certificates always expire; without the
  -- date, "suspend on expired documents" can never fire. Captured at upload,
  -- confirmed by the reviewer.
  add column expires_at date,
  -- Only paperwork that is legally about one car may be scoped to a car.
  -- (Written against pre-existing enum values only: new values cannot be
  -- referenced in the transaction that adds them.)
  add constraint vendor_documents_vehicle_scope check (
    vehicle_id is null or type in ('carte_grise', 'insurance', 'roadworthiness')
  );

-- One document per type per scope, replacing the old fleet-wide
-- UNIQUE (vendor_id, type): vendor-scoped docs stay unique per vendor,
-- vehicle-scoped docs are unique per vehicle.
alter table vendor_documents drop constraint vendor_documents_vendor_id_type_key;
create unique index vendor_documents_vendor_scope_key
  on vendor_documents(vendor_id, type) where vehicle_id is null;
create unique index vendor_documents_vehicle_scope_key
  on vendor_documents(vehicle_id, type) where vehicle_id is not null;

create index if not exists idx_vendor_documents_vehicle on vendor_documents(vehicle_id);
create index if not exists idx_vendor_documents_expiry on vendor_documents(expires_at)
  where expires_at is not null;

-- ── Vendor: the contact fields the onboarding form actually asks for ────────

alter table vendors
  -- WhatsApp is the primary business channel in Cameroon; it is often not
  -- the same number as the one that answers calls.
  add column whatsapp_number text,
  -- The human to talk to, which for registered businesses is rarely the
  -- business name itself.
  add column contact_person text,
  -- Free-text street / quarter. City stays the coarse enum used for search.
  add column address text,
  -- When the vendor accepted the onboarding declaration (information is
  -- accurate, vehicles roadworthy, insurance valid, listings kept current).
  -- Null for vendors onboarded before the declaration existed.
  add column declaration_accepted_at timestamptz;

-- ── Vehicle: plate, fuel, weekly/monthly pricing ─────────────────────────────

create type fuel_type as enum ('petrol', 'diesel', 'hybrid', 'electric');

alter table vehicles
  -- The number plate, as printed. Deliberately not UNIQUE: plates are typed
  -- by hand ("LT 123 AB" vs "LT123AB") and a false conflict would block an
  -- honest listing; admins match it against the carte grise instead.
  add column registration_number text,
  add column fuel_type fuel_type,
  -- Optional longer-term rates set by the vendor (spec: daily/weekly/monthly
  -- pricing). Null = the car simply charges daily_rate_xaf x days.
  add column weekly_rate_xaf integer,
  add column monthly_rate_xaf integer,
  add constraint vehicles_weekly_rate_pos check (weekly_rate_xaf is null or weekly_rate_xaf > 0),
  add constraint vehicles_monthly_rate_pos check (monthly_rate_xaf is null or monthly_rate_xaf > 0);
