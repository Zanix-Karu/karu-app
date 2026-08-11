-- 0016: Booking messages — in-app chat between the parties of a booking.
--
-- Supersedes the email relay as the customer↔vendor channel while keeping the
-- marketplace's core rule: contact details never cross the platform boundary.
-- The API redacts emails/phone numbers from non-admin messages before they are
-- stored (the `redacted` flag records that this happened), and admins see and
-- can join every thread — that is the intervention mechanism, not an
-- afterthought.

CREATE TABLE IF NOT EXISTS booking_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  -- Snapshotted at send time so a later role change never relabels history.
  sender_role user_role NOT NULL,
  body        TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  -- True when the API removed contact details from the original text.
  redacted    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Thread reads are always "the whole thread for one booking, oldest first".
CREATE INDEX IF NOT EXISTS idx_booking_messages_booking
  ON booking_messages(booking_id, created_at);

-- Per-user read cursor, one row per (booking, reader). Upserted every time a
-- thread is opened; unread counts are "messages newer than my cursor".
CREATE TABLE IF NOT EXISTS booking_message_reads (
  booking_id   UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  profile_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (booking_id, profile_id)
);

-- RLS: same posture as 0008 — the NestJS API (service role) is the real
-- authorization layer; these policies are defense in depth for any future
-- direct-to-Supabase client. Reads open to the booking's parties; writes only
-- via the API, which is where redaction happens (an INSERT policy here would
-- let a client bypass it).
ALTER TABLE booking_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY booking_messages_parties_select ON booking_messages
  FOR SELECT USING (
    booking_id IN (
      SELECT id FROM bookings
      WHERE customer_id = auth.uid() OR vendor_id = current_vendor_id()
    )
  );

ALTER TABLE booking_message_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY booking_message_reads_self ON booking_message_reads
  FOR ALL USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());
