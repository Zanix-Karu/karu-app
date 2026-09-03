-- 0023: Let either party pull Karu into a booking conversation.
--
-- The flow is: the provider approves or rejects the customer's request, and
-- Karu stays out of it unless asked. That works right up until it doesn't —
-- a disagreement over damage, a no-show, a customer who cannot reach the
-- provider — and until now the only route was for someone to email support
-- and hope. Admins could see every thread but had no signal telling them
-- which one needed them.
--
-- So the escalation is explicit: either party raises a hand from the chat,
-- and that booking surfaces on the admin console's attention panel until an
-- admin marks it handled. Modelled as columns rather than a table because a
-- booking has at most one open request at a time; the resolved timestamp
-- keeps the history rather than clearing the flag.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS assistance_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assistance_requested_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assistance_note TEXT,
  ADD COLUMN IF NOT EXISTS assistance_resolved_at TIMESTAMPTZ;

-- The console reads "open requests, newest first" on every page load, and that
-- is a small slice of a growing table.
CREATE INDEX IF NOT EXISTS idx_bookings_open_assistance
  ON bookings (assistance_requested_at DESC)
  WHERE assistance_requested_at IS NOT NULL AND assistance_resolved_at IS NULL;

COMMENT ON COLUMN bookings.assistance_requested_at IS
  'When a customer or provider asked Karu to step in. Null = never asked.';
COMMENT ON COLUMN bookings.assistance_resolved_at IS
  'When an admin marked the request handled. Null while open.';
