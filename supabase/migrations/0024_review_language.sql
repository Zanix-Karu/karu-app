-- 0024: Record what language a review was written in, and cache translations.
--
-- Reviews are free text from customers who use the app in French or English,
-- and the reader may be using the other one. Today a French review sits
-- untranslated on the English site and vice versa, with an English `lang`
-- attribute on it, so a screen reader pronounces French with an English voice.
--
-- Two columns of intent here:
--   * reviews.language  — what the author wrote in, so the reader can be told
--     and the markup can carry a correct lang attribute.
--   * review_translations — machine output, cached per target language so a
--     given review is translated once rather than on every page view.
--
-- Translations are deliberately a separate table, not a column: the original
-- is the record and must never be overwritten by machine output.

ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS language TEXT
  CHECK (language IS NULL OR language IN ('en', 'fr'));

COMMENT ON COLUMN reviews.language IS
  'Language the author wrote in. Null for reviews written before 0024.';

CREATE TABLE IF NOT EXISTS review_translations (
  review_id   UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  target_lang TEXT NOT NULL CHECK (target_lang IN ('en', 'fr')),
  body        TEXT NOT NULL,
  -- Which engine produced it, so a later change of provider can invalidate
  -- selectively rather than dropping every cached translation.
  provider    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (review_id, target_lang)
);

-- Same posture as email_log and vehicle_blocks: the API holds the service role
-- and is the authorisation boundary, so no end-user JWT touches this directly.
ALTER TABLE review_translations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.review_translations FROM anon, authenticated;

-- Backfill existing reviews from their author's interface locale, which is the
-- same signal the write path now records. Without this the feature would do
-- nothing for the reviews that prompted it: the component shows no control
-- when the source language is unknown, so every pre-existing review would keep
-- sitting in the wrong language with no way to read it.
--
-- Only fills rows still null, so it is safe to re-run and cannot overwrite a
-- recorded value.
UPDATE reviews r
SET language = p.locale
FROM profiles p
WHERE p.id = r.author_id
  AND r.language IS NULL
  AND r.comment IS NOT NULL
  AND p.locale IN ('en', 'fr');
