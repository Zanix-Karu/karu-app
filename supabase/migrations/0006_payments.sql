-- 0006: Payments
-- Escrow-style record tied 1:1 to a booking. Provider is Cameroon mobile money
-- (MTN MoMo / Orange Money). The actual provider integration lives in the API;
-- this table is the source of truth for payment state and reconciliation refs.

CREATE TABLE IF NOT EXISTS payments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    UUID NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  provider      payment_provider NOT NULL,
  amount_xaf    INTEGER NOT NULL CHECK (amount_xaf > 0),
  status        payment_status NOT NULL DEFAULT 'pending',
  provider_ref  TEXT,            -- external transaction id from the MoMo/OM API
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_provider_ref ON payments(provider_ref);

CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
