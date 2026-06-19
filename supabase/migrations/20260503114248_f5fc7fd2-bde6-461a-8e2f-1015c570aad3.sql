-- Track reel views to avoid re-showing
CREATE TABLE IF NOT EXISTS public.reel_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  post_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, post_id)
);
ALTER TABLE public.reel_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own reel views" ON public.reel_views FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own reel views" ON public.reel_views FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Favorites
CREATE TABLE IF NOT EXISTS public.favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  post_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, post_id)
);
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own favorites" ON public.favorites FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users add favorites" ON public.favorites FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users remove favorites" ON public.favorites FOR DELETE USING (auth.uid() = user_id);

-- Pinned posts on profile
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS pinned_at timestamptz;