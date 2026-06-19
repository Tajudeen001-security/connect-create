
-- 1. Posts: monetization + polls
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS unlock_price integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_poll boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS poll_options jsonb;

-- 2. Poll votes
CREATE TABLE IF NOT EXISTS public.poll_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  user_id uuid NOT NULL,
  option_index integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Poll votes viewable by everyone" ON public.poll_votes FOR SELECT USING (true);
CREATE POLICY "Users can vote" ON public.poll_votes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can change their vote" ON public.poll_votes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can remove their vote" ON public.poll_votes FOR DELETE USING (auth.uid() = user_id);

-- 3. Post unlocks (paywall)
CREATE TABLE IF NOT EXISTS public.post_unlocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  user_id uuid NOT NULL,
  coin_amount integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);
ALTER TABLE public.post_unlocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view their unlocks or creators view buyers"
  ON public.post_unlocks FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_unlocks.post_id AND p.user_id = auth.uid())
  );
CREATE POLICY "Users can unlock posts" ON public.post_unlocks FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 4. Trigger: deduct coins on unlock and credit creator (70/30 split)
CREATE OR REPLACE FUNCTION public.process_post_unlock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  creator_id uuid;
  fee integer;
  payout integer;
BEGIN
  SELECT user_id INTO creator_id FROM public.posts WHERE id = NEW.post_id;
  IF creator_id IS NULL THEN RAISE EXCEPTION 'Post not found'; END IF;
  IF creator_id = NEW.user_id THEN RETURN NEW; END IF;

  fee := FLOOR(NEW.coin_amount * 0.3);
  payout := NEW.coin_amount - fee;

  UPDATE public.profiles SET jagx_coins = jagx_coins - NEW.coin_amount
   WHERE user_id = NEW.user_id AND jagx_coins >= NEW.coin_amount;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient coins'; END IF;

  UPDATE public.profiles SET jagx_coins = jagx_coins + payout WHERE user_id = creator_id;

  INSERT INTO public.notifications (user_id, from_user_id, type, content, related_post_id)
  VALUES (creator_id, NEW.user_id, 'unlock', 'unlocked your post for ' || NEW.coin_amount || ' coins', NEW.post_id);

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_process_post_unlock ON public.post_unlocks;
CREATE TRIGGER trg_process_post_unlock
  BEFORE INSERT ON public.post_unlocks
  FOR EACH ROW EXECUTE FUNCTION public.process_post_unlock();

-- 5. Reel views: ensure unique + index for fast filtering
CREATE UNIQUE INDEX IF NOT EXISTS reel_views_user_post_uniq ON public.reel_views(user_id, post_id);
CREATE INDEX IF NOT EXISTS reel_views_user_idx ON public.reel_views(user_id);

-- 6. Notify admins on new user signup (with location)
CREATE OR REPLACE FUNCTION public.notify_admins_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_record RECORD;
BEGIN
  FOR admin_record IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
    INSERT INTO public.notifications (user_id, from_user_id, type, content)
    VALUES (
      admin_record.user_id,
      NEW.user_id,
      'new_user',
      'New user @' || COALESCE(NEW.username, 'unknown') || COALESCE(' from ' || NEW.location, '')
    );
  END LOOP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_admins_new_user ON public.profiles;
CREATE TRIGGER trg_notify_admins_new_user
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.notify_admins_new_user();

-- 7. Speed up notification → post navigation
CREATE INDEX IF NOT EXISTS notifications_related_post_idx ON public.notifications(related_post_id);
