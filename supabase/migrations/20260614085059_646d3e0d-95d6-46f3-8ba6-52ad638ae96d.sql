
-- 1) Profile location/IP fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_ip text,
  ADD COLUMN IF NOT EXISTS last_country text,
  ADD COLUMN IF NOT EXISTS last_region text,
  ADD COLUMN IF NOT EXISTS last_city text,
  ADD COLUMN IF NOT EXISTS last_seen_geo_at timestamptz;

-- Admin can read every profile (for moderation / location view)
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2) AI API usage log
CREATE TABLE IF NOT EXISTS public.ai_api_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  api_key_id uuid REFERENCES public.api_keys(id) ON DELETE SET NULL,
  model text,
  endpoint text,
  prompt_tokens integer DEFAULT 0,
  completion_tokens integer DEFAULT 0,
  total_tokens integer DEFAULT 0,
  latency_ms integer,
  status text NOT NULL DEFAULT 'success',
  error_message text,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON public.ai_api_usage(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_key  ON public.ai_api_usage(api_key_id, created_at DESC);

GRANT SELECT ON public.ai_api_usage TO authenticated;
GRANT ALL ON public.ai_api_usage TO service_role;

ALTER TABLE public.ai_api_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own ai usage" ON public.ai_api_usage
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- 3) Ads moderation fields
ALTER TABLE public.ads
  ADD COLUMN IF NOT EXISTS violation_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_paused_reason text;
