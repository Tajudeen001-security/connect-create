-- ============================================================
-- Adds the post-feature columns that the app code expects but
-- the bootstrap-core patch did not include. Idempotent.
-- Run in Supabase SQL Editor AFTER 2026-06-19-bootstrap-core.sql.
-- ============================================================

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS hashtags     text[],
  ADD COLUMN IF NOT EXISTS post_type    text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS is_poll      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS poll_options jsonb,
  ADD COLUMN IF NOT EXISTS unlock_price integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS view_count   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at   timestamptz NOT NULL DEFAULT now();

-- Stories table used by CreatePage when posting a story.
CREATE TABLE IF NOT EXISTS public.stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  media_url text NOT NULL,
  media_type text NOT NULL DEFAULT 'image',
  caption text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);
CREATE INDEX IF NOT EXISTS stories_user_idx ON public.stories(user_id, created_at DESC);

GRANT SELECT ON public.stories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stories TO authenticated;
GRANT ALL ON public.stories TO service_role;
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stories_public_read" ON public.stories;
CREATE POLICY "stories_public_read" ON public.stories
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "stories_insert_own" ON public.stories;
CREATE POLICY "stories_insert_own" ON public.stories
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "stories_delete_own" ON public.stories;
CREATE POLICY "stories_delete_own" ON public.stories
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
