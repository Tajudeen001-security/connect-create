-- ============================================================
-- JagX Connect — Phase 1 schema patch (run in Supabase SQL Editor)
-- Idempotent. Safe to re-run. Apply once after deploying this build.
-- Path: /supabase-patches/2026-06-19-roles-push-admin.sql
-- ============================================================

-- 1) Roles & has_role()
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_roles" ON public.user_roles;
CREATE POLICY "users_read_own_roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

DROP POLICY IF EXISTS "admins_manage_roles" ON public.user_roles;
CREATE POLICY "admins_manage_roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2) Auto-grant admin to jagwazorld@gmail.com on signup + retro-grant
CREATE OR REPLACE FUNCTION public.handle_admin_bootstrap()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF lower(NEW.email) = 'jagwazorld@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_admin_bootstrap ON auth.users;
CREATE TRIGGER on_auth_user_created_admin_bootstrap
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_admin_bootstrap();

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM auth.users WHERE lower(email) = 'jagwazorld@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- 3) Ban flag on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS banned_at timestamptz,
  ADD COLUMN IF NOT EXISTS banned_reason text;

-- 4) Promoted posts (admin can boost)
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS is_promoted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promoted_until timestamptz;

-- 5) Allow creator to SELECT their just-created group (fixes group-create error)
DROP POLICY IF EXISTS "Creator can view own groups" ON public.group_chats;
CREATE POLICY "Creator can view own groups" ON public.group_chats
  FOR SELECT TO authenticated
  USING (auth.uid() = creator_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_chats   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_messages TO authenticated;
GRANT ALL ON public.group_chats   TO service_role;
GRANT ALL ON public.group_members TO service_role;
GRANT ALL ON public.group_messages TO service_role;

-- 6) Push tokens (Firebase Cloud Messaging)
CREATE TABLE IF NOT EXISTS public.push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text NOT NULL DEFAULT 'web',
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (token)
);
CREATE INDEX IF NOT EXISTS push_tokens_user_id_idx ON public.push_tokens(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_tokens TO authenticated;
GRANT ALL ON public.push_tokens TO service_role;
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_manage_own_push_tokens" ON public.push_tokens;
CREATE POLICY "users_manage_own_push_tokens" ON public.push_tokens
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 7) Seed editable theme config keys (used by future admin theme picker)
INSERT INTO public.app_config (key, value) VALUES
  ('theme.primary',    '"#D4AF37"'::jsonb),
  ('theme.background', '"#0a0a0a"'::jsonb),
  ('theme.accent',     '"#F5E6A0"'::jsonb),
  ('app.name',         '"JagX Connect"'::jsonb)
ON CONFLICT (key) DO NOTHING;
