-- 0025: Feedback & issue reports (FEAT-3).
--
-- One channel for customers and vendors to report bugs / ideas, optionally with
-- screenshots, triaged by the ops team from the admin console. RLS posture
-- mirrors 0017/0008: the NestJS API (service role) is the real authorization
-- layer; the policy here is defense in depth for any future direct-to-Supabase
-- client. Authors may read their own reports; all writes and the admin queue go
-- through the API.

DO $$ BEGIN
  CREATE TYPE feedback_category AS ENUM ('bug', 'idea', 'other');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE feedback_status AS ENUM ('new', 'triaging', 'resolved');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS feedback (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Snapshot of the author's role at report time, so a later role change
  -- doesn't relabel who raised it.
  author_role  user_role NOT NULL,
  category     feedback_category NOT NULL DEFAULT 'bug',
  message      TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 4000),
  -- Where they were + which build, captured client-side to speed triage.
  page         TEXT,
  app_version  TEXT,
  -- Storage paths in the private `feedback-images` bucket (below). Capped at 5
  -- client- and API-side; the check is a backstop.
  image_paths  TEXT[] NOT NULL DEFAULT '{}' CHECK (array_length(image_paths, 1) IS NULL OR array_length(image_paths, 1) <= 5),
  status       feedback_status NOT NULL DEFAULT 'new',
  -- Admin triage trail.
  admin_note   TEXT,
  resolved_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_status_created ON feedback(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_author ON feedback(author_id, created_at DESC);

-- set_updated_at() exists since the base schema (hardened in 0021).
DROP TRIGGER IF EXISTS feedback_set_updated_at ON feedback;
CREATE TRIGGER feedback_set_updated_at
  BEFORE UPDATE ON feedback
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS: authors read their own; every write + the admin queue go via the API
-- (service role bypasses RLS). No INSERT/UPDATE policy on purpose.
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS feedback_author_select ON feedback;
CREATE POLICY feedback_author_select ON feedback
  FOR SELECT USING (author_id = auth.uid());

-- Private bucket for screenshots. Reads are brokered by the API via short-lived
-- signed URLs; uploads via short-lived signed upload URLs. No public access.
INSERT INTO storage.buckets (id, name, public)
VALUES ('feedback-images', 'feedback-images', false)
ON CONFLICT (id) DO NOTHING;
