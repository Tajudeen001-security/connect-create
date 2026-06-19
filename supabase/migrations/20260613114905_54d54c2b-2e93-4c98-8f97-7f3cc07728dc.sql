
-- 1. Relax coin_transactions check constraints
ALTER TABLE public.coin_transactions DROP CONSTRAINT IF EXISTS coin_transactions_status_check;
ALTER TABLE public.coin_transactions ADD CONSTRAINT coin_transactions_status_check
  CHECK (status = ANY (ARRAY['pending','approved','rejected','completed','failed']));

ALTER TABLE public.coin_transactions DROP CONSTRAINT IF EXISTS coin_transactions_transaction_type_check;
ALTER TABLE public.coin_transactions ADD CONSTRAINT coin_transactions_transaction_type_check
  CHECK (transaction_type = ANY (ARRAY['purchase','tip_sent','tip_received','verification_purchase','api_key_purchase','gift_sent','gift_received','unlock','withdrawal']));

-- 2. Fix broken group RLS policies (typo: group_members.group_id = group_members.id)
DROP POLICY IF EXISTS "Members can view their groups" ON public.group_chats;
DROP POLICY IF EXISTS "Admins can update groups" ON public.group_chats;
DROP POLICY IF EXISTS "Admins can delete groups" ON public.group_chats;

CREATE POLICY "Members can view their groups" ON public.group_chats FOR SELECT
USING (EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = group_chats.id AND gm.user_id = auth.uid()));

CREATE POLICY "Creator or admin can update groups" ON public.group_chats FOR UPDATE
USING (auth.uid() = creator_id OR EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = group_chats.id AND gm.user_id = auth.uid() AND gm.role = 'admin'));

CREATE POLICY "Creator or admin can delete groups" ON public.group_chats FOR DELETE
USING (auth.uid() = creator_id OR EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = group_chats.id AND gm.user_id = auth.uid() AND gm.role = 'admin'));

-- 3. Per-conversation chat themes
CREATE TABLE IF NOT EXISTS public.chat_themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  peer_id uuid NOT NULL,
  theme_color text,
  background_url text,
  bubble_style text DEFAULT 'classic',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, peer_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_themes TO authenticated;
GRANT ALL ON public.chat_themes TO service_role;

ALTER TABLE public.chat_themes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own chat themes" ON public.chat_themes
FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
