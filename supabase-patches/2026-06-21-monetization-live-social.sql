-- ============================================================
-- JagX Connect — Monetization, Live, Gifts, Profile Views, Replies
-- Run AFTER bootstrap-core. Idempotent: safe to re-run.
--
-- Fixes the following user-reported errors:
--   * "can not find table" when uploading coin / verification receipts
--   * "can not find payment column" on verification upload
--   * Replies on posts not saving (missing parent_comment_id column)
--   * "Failed to go live" (missing live_streams + related tables)
--   * Live gifting / commenting / clipping / leaderboard
--   * Group chat messages not delivering (missing group_messages or RLS)
--   * Profile view notifications
--   * Gift sending on posts
--   * Receipts storage bucket missing
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 0) Make sure comments support REPLIES (parent_comment_id)
-- ============================================================
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS parent_comment_id uuid REFERENCES public.comments(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_comments_parent ON public.comments(parent_comment_id);

-- ============================================================
-- 1) Coin balance on profile + coin_transactions
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS coin_balance integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.coin_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount integer NOT NULL DEFAULT 0,
  transaction_type text NOT NULL,           -- purchase | gift_sent | gift_received | verification_purchase | refund
  receipt_url text,
  opay_reference text,
  payment_proof_url text,
  status text NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Back-compat: if an older version of the table exists without these cols, add them.
ALTER TABLE public.coin_transactions ADD COLUMN IF NOT EXISTS receipt_url text;
ALTER TABLE public.coin_transactions ADD COLUMN IF NOT EXISTS opay_reference text;
ALTER TABLE public.coin_transactions ADD COLUMN IF NOT EXISTS payment_proof_url text;
ALTER TABLE public.coin_transactions ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';

GRANT SELECT, INSERT ON public.coin_transactions TO authenticated;
GRANT ALL ON public.coin_transactions TO service_role;
ALTER TABLE public.coin_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coin_tx_select_own" ON public.coin_transactions;
CREATE POLICY "coin_tx_select_own" ON public.coin_transactions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "coin_tx_insert_own" ON public.coin_transactions;
CREATE POLICY "coin_tx_insert_own" ON public.coin_transactions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 2) verification_requests
-- ============================================================
CREATE TABLE IF NOT EXISTS public.verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_proof_url text,
  receipt_url text,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.verification_requests ADD COLUMN IF NOT EXISTS payment_proof_url text;
ALTER TABLE public.verification_requests ADD COLUMN IF NOT EXISTS receipt_url text;
ALTER TABLE public.verification_requests ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';

GRANT SELECT, INSERT ON public.verification_requests TO authenticated;
GRANT ALL ON public.verification_requests TO service_role;
ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "verif_select_own" ON public.verification_requests;
CREATE POLICY "verif_select_own" ON public.verification_requests
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "verif_insert_own" ON public.verification_requests;
CREATE POLICY "verif_insert_own" ON public.verification_requests
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 3) Storage bucket: receipts
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "receipts_upload_own" ON storage.objects;
CREATE POLICY "receipts_upload_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "receipts_read_own" ON storage.objects;
CREATE POLICY "receipts_read_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- 4) Live streaming
-- ============================================================
CREATE TABLE IF NOT EXISTS public.live_streams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text,
  room_name text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'live',  -- live | ended
  viewer_count integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
GRANT SELECT ON public.live_streams TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_streams TO authenticated;
GRANT ALL ON public.live_streams TO service_role;
ALTER TABLE public.live_streams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "live_public_read" ON public.live_streams;
CREATE POLICY "live_public_read" ON public.live_streams FOR SELECT USING (true);
DROP POLICY IF EXISTS "live_insert_own" ON public.live_streams;
CREATE POLICY "live_insert_own" ON public.live_streams
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = host_user_id);
DROP POLICY IF EXISTS "live_update_own" ON public.live_streams;
CREATE POLICY "live_update_own" ON public.live_streams
  FOR UPDATE TO authenticated USING (auth.uid() = host_user_id);

-- Live comments / gifts / clips
CREATE TABLE IF NOT EXISTS public.live_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id uuid NOT NULL REFERENCES public.live_streams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.live_comments TO authenticated;
GRANT SELECT ON public.live_comments TO anon;
GRANT ALL ON public.live_comments TO service_role;
ALTER TABLE public.live_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lc_read" ON public.live_comments;
CREATE POLICY "lc_read" ON public.live_comments FOR SELECT USING (true);
DROP POLICY IF EXISTS "lc_insert" ON public.live_comments;
CREATE POLICY "lc_insert" ON public.live_comments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.live_gifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id uuid REFERENCES public.live_streams(id) ON DELETE CASCADE,
  post_id uuid,    -- nullable when sent in a live; references posts if used on a post
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gift_type text NOT NULL,           -- rose | crown | jet | diamond etc.
  coin_amount integer NOT NULL,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.live_gifts TO authenticated;
GRANT SELECT ON public.live_gifts TO anon;
GRANT ALL ON public.live_gifts TO service_role;
ALTER TABLE public.live_gifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lg_read" ON public.live_gifts;
CREATE POLICY "lg_read" ON public.live_gifts FOR SELECT USING (true);
DROP POLICY IF EXISTS "lg_insert" ON public.live_gifts;
CREATE POLICY "lg_insert" ON public.live_gifts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);

CREATE TABLE IF NOT EXISTS public.live_clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id uuid NOT NULL REFERENCES public.live_streams(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clip_url text NOT NULL,
  thumbnail_url text,
  duration_sec integer,
  title text,
  view_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.live_clips TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_clips TO authenticated;
GRANT ALL ON public.live_clips TO service_role;
ALTER TABLE public.live_clips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clips_read" ON public.live_clips;
CREATE POLICY "clips_read" ON public.live_clips FOR SELECT USING (true);
DROP POLICY IF EXISTS "clips_insert_own" ON public.live_clips;
CREATE POLICY "clips_insert_own" ON public.live_clips
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_id);

-- Leaderboard view (top gift recipients)
CREATE OR REPLACE VIEW public.live_leaderboard
WITH (security_invoker=on) AS
  SELECT recipient_id AS user_id,
         SUM(coin_amount)::bigint AS total_coins,
         COUNT(*)::bigint AS gift_count
    FROM public.live_gifts
   GROUP BY recipient_id
   ORDER BY total_coins DESC;

GRANT SELECT ON public.live_leaderboard TO anon, authenticated;

-- Storage bucket: clips
INSERT INTO storage.buckets (id, name, public)
VALUES ('clips', 'clips', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "clips_public_read" ON storage.objects;
CREATE POLICY "clips_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'clips');
DROP POLICY IF EXISTS "clips_upload_own" ON storage.objects;
CREATE POLICY "clips_upload_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'clips' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- 5) Group chat messages — ensure table + RLS allow members to see/post
-- ============================================================
CREATE TABLE IF NOT EXISTS public.group_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.group_chats(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text,
  media_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_group_messages_group ON public.group_messages(group_id, created_at DESC);

GRANT SELECT, INSERT, DELETE ON public.group_messages TO authenticated;
GRANT ALL ON public.group_messages TO service_role;
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gm_members_read" ON public.group_messages;
CREATE POLICY "gm_members_read" ON public.group_messages
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.group_chat_members m
                  WHERE m.group_id = group_messages.group_id AND m.user_id = auth.uid()));

DROP POLICY IF EXISTS "gm_members_insert" ON public.group_messages;
CREATE POLICY "gm_members_insert" ON public.group_messages
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id AND EXISTS (
    SELECT 1 FROM public.group_chat_members m
     WHERE m.group_id = group_messages.group_id AND m.user_id = auth.uid()));

DROP POLICY IF EXISTS "gm_own_delete" ON public.group_messages;
CREATE POLICY "gm_own_delete" ON public.group_messages
  FOR DELETE TO authenticated USING (auth.uid() = sender_id);

-- Enable realtime for chat-style tables (best-effort, ignore if already added).
DO $$ BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.group_messages';
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;
DO $$ BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.live_comments';
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;
DO $$ BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.live_gifts';
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;
DO $$ BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.comments';
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;

-- ============================================================
-- 6) Profile views + notify the viewed user
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profile_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewed_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pv_viewed ON public.profile_views(viewed_user_id, created_at DESC);

GRANT SELECT, INSERT ON public.profile_views TO authenticated;
GRANT ALL ON public.profile_views TO service_role;
ALTER TABLE public.profile_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pv_insert_self" ON public.profile_views;
CREATE POLICY "pv_insert_self" ON public.profile_views
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = viewer_id);

DROP POLICY IF EXISTS "pv_select_viewed" ON public.profile_views;
CREATE POLICY "pv_select_viewed" ON public.profile_views
  FOR SELECT TO authenticated
  USING (auth.uid() = viewed_user_id OR auth.uid() = viewer_id);

-- Trigger: create a notification row when a profile is viewed (skip self-view).
CREATE OR REPLACE FUNCTION public.notify_profile_view()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.viewer_id <> NEW.viewed_user_id THEN
    INSERT INTO public.notifications (user_id, actor_id, type, entity_type, entity_id)
    VALUES (NEW.viewed_user_id, NEW.viewer_id, 'profile_view', 'profile', NEW.viewer_id);
  END IF;
  RETURN NEW;
EXCEPTION WHEN others THEN
  -- Don't block the insert if notifications table shape differs.
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_profile_view ON public.profile_views;
CREATE TRIGGER trg_notify_profile_view
  AFTER INSERT ON public.profile_views
  FOR EACH ROW EXECUTE FUNCTION public.notify_profile_view();

-- ============================================================
-- 7) Notifications table — make sure it exists and has needed cols
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  entity_type text,
  entity_id uuid,
  payload jsonb,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS actor_id uuid;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS entity_type text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS entity_id uuid;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS is_read boolean NOT NULL DEFAULT false;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_select_own" ON public.notifications;
CREATE POLICY "notif_select_own" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "notif_update_own" ON public.notifications;
CREATE POLICY "notif_update_own" ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "notif_insert_any_auth" ON public.notifications;
CREATE POLICY "notif_insert_any_auth" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (true);

DO $$ BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications';
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;

-- ============================================================
-- 8) Post gifts (gift coins on a post)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.post_gifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gift_type text NOT NULL,
  coin_amount integer NOT NULL,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.post_gifts TO authenticated;
GRANT SELECT ON public.post_gifts TO anon;
GRANT ALL ON public.post_gifts TO service_role;
ALTER TABLE public.post_gifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pg_read" ON public.post_gifts;
CREATE POLICY "pg_read" ON public.post_gifts FOR SELECT USING (true);
DROP POLICY IF EXISTS "pg_insert" ON public.post_gifts;
CREATE POLICY "pg_insert" ON public.post_gifts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);

-- ============================================================
-- 9) ai_api_usage (log table for ai-chat function)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ai_api_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  model text,
  endpoint text,
  latency_ms integer,
  status text,
  error_message text,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.ai_api_usage TO authenticated, anon;
GRANT ALL ON public.ai_api_usage TO service_role;
ALTER TABLE public.ai_api_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "aiu_service_only_read" ON public.ai_api_usage;
CREATE POLICY "aiu_service_only_read" ON public.ai_api_usage
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
