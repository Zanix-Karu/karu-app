-- 0031: Translate booking chat, Instagram style (docs/IDEAS-2026-10-04.md #2).
--
-- A customer in London writes in English, the provider in Douala replies in
-- French, and until now each side squinted at the other's message. Same
-- pattern as reviews (0024): record what language the sender wrote in, so the
-- reader is only offered "See translation" when it differs from theirs, and
-- cache machine output per target language so a message is paid for once.
-- The original stays the record; translations live in their own table.

ALTER TABLE public.booking_messages
  ADD COLUMN IF NOT EXISTS language TEXT
  CHECK (language IS NULL OR language IN ('en', 'fr'));

COMMENT ON COLUMN public.booking_messages.language IS
  'Interface language of the sender when they wrote it. Null before 0031.';

CREATE TABLE IF NOT EXISTS public.booking_message_translations (
  message_id  UUID NOT NULL REFERENCES public.booking_messages(id) ON DELETE CASCADE,
  target_lang TEXT NOT NULL CHECK (target_lang IN ('en', 'fr')),
  body        TEXT NOT NULL,
  provider    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, target_lang)
);

ALTER TABLE public.booking_message_translations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_message_translations FROM anon, authenticated;

-- Backfill from the sender's current locale, as 0024 did for reviews, so
-- existing threads get the control too. Admin messages are left null: Karu
-- Support writes in whatever the conversation needs.
UPDATE public.booking_messages m
SET language = p.locale
FROM public.profiles p
WHERE m.sender_id = p.id
  AND m.language IS NULL
  AND m.sender_role <> 'admin'
  AND p.locale IN ('en', 'fr');
