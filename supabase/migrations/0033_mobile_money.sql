-- 0033: Mobile money through Notch Pay (docs/IDEAS-2026-10-04.md #1).
--
-- 'mobile_money' rather than reusing mtn_momo / orange_money: Notch Pay's
-- hosted page lets the customer pick the network, so at the moment the row is
-- created we genuinely don't know which one it will be.

ALTER TYPE payment_provider ADD VALUE IF NOT EXISTS 'mobile_money';
