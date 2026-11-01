-- 0036: Site-wide settings, starting with appearance.
--
-- The admin picks the colour theme for everyone: one palette for light mode
-- and one for dark mode. Each visitor then only chooses light, dark or
-- "match my device" (stored on their device, not here).
--
-- RLS posture mirrors 0025: the NestJS API (service role) is the real
-- authorization layer. Reads are public through the API; writes are
-- admin-only through the API. No policies, so a direct client gets nothing.

CREATE TABLE IF NOT EXISTS site_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS site_settings_set_updated_at ON site_settings;
CREATE TRIGGER site_settings_set_updated_at
  BEFORE UPDATE ON site_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO site_settings (key, value)
VALUES ('appearance', '{"light": "karu", "dark": "karu_night"}'::jsonb)
ON CONFLICT (key) DO NOTHING;
