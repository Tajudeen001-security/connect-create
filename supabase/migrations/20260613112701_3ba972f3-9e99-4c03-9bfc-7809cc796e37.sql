
-- 1. Extend profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS middle_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS sex text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS country_locked boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS signup_ip text,
  ADD COLUMN IF NOT EXISTS signup_country text,
  ADD COLUMN IF NOT EXISTS last_known_country text,
  ADD COLUMN IF NOT EXISTS vpn_suspected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_training_consent boolean NOT NULL DEFAULT false;

-- 2. Pin messages
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz;

-- 3. Conversation pins (which chats a user has pinned to top of their inbox)
CREATE TABLE IF NOT EXISTS public.conversation_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  peer_id uuid NOT NULL,
  pinned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, peer_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_pins TO authenticated;
GRANT ALL ON public.conversation_pins TO service_role;
ALTER TABLE public.conversation_pins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage their own pins" ON public.conversation_pins;
CREATE POLICY "Users manage their own pins" ON public.conversation_pins
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4. AI training samples (opt-in)
CREATE TABLE IF NOT EXISTS public.ai_training_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source text NOT NULL,
  source_id uuid,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ai_training_samples TO service_role;
ALTER TABLE public.ai_training_samples ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Only admins can read training samples" ON public.ai_training_samples;
CREATE POLICY "Only admins can read training samples" ON public.ai_training_samples
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- Trigger: copy a message into training samples if sender consented
CREATE OR REPLACE FUNCTION public.maybe_capture_training_sample()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  consented boolean;
BEGIN
  IF NEW.content IS NULL OR length(NEW.content) < 2 THEN RETURN NEW; END IF;
  SELECT ai_training_consent INTO consented FROM public.profiles WHERE user_id = NEW.sender_id;
  IF consented THEN
    INSERT INTO public.ai_training_samples (user_id, source, source_id, content)
    VALUES (NEW.sender_id, 'message', NEW.id, NEW.content);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_messages_training_capture ON public.messages;
CREATE TRIGGER trg_messages_training_capture
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.maybe_capture_training_sample();

-- 5. House ads flag
ALTER TABLE public.ads
  ADD COLUMN IF NOT EXISTS is_house_ad boolean NOT NULL DEFAULT false;

-- 6. Helpful indexes
CREATE INDEX IF NOT EXISTS idx_conversation_pins_user ON public.conversation_pins(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_pinned ON public.messages(pinned_at) WHERE pinned_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_country ON public.profiles(country);
CREATE INDEX IF NOT EXISTS idx_ai_training_samples_user ON public.ai_training_samples(user_id);
