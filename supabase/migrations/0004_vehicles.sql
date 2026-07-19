-- 0004: Vehicles
-- A listing owned by a vendor. Only vehicles with status='active' belonging to a
-- 'verified' vendor are publicly bookable (enforced in the API / RLS).

CREATE TABLE IF NOT EXISTS vehicles (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id        UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  make             TEXT NOT NULL,
  model            TEXT NOT NULL,
  year             INT CHECK (year IS NULL OR year BETWEEN 1980 AND 2100),
  category         vehicle_category NOT NULL,
  seats            INT CHECK (seats IS NULL OR seats BETWEEN 1 AND 50),
  transmission     transmission NOT NULL DEFAULT 'manual',
  daily_rate_xaf   INTEGER NOT NULL CHECK (daily_rate_xaf > 0),
  city             city NOT NULL,
  pickup_locations TEXT[] NOT NULL DEFAULT '{}',
  photos           TEXT[] NOT NULL DEFAULT '{}',
  description      TEXT,
  status           vehicle_status NOT NULL DEFAULT 'draft',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicles_vendor ON vehicles(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_city ON vehicles(city);
CREATE INDEX IF NOT EXISTS idx_vehicles_category ON vehicles(category);
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(status);
-- Common browse query: active cars in a city sorted by price.
CREATE INDEX IF NOT EXISTS idx_vehicles_browse ON vehicles(city, status, daily_rate_xaf);

CREATE TRIGGER trg_vehicles_updated_at
  BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
