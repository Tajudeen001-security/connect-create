
-- Ad placement controls
ALTER TABLE public.ads
  ADD COLUMN IF NOT EXISTS placement_section text NOT NULL DEFAULT 'home',
  ADD COLUMN IF NOT EXISTS placement_frequency integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS admin_section text,
  ADD COLUMN IF NOT EXISTS admin_frequency integer,
  ADD COLUMN IF NOT EXISTS admin_override boolean NOT NULL DEFAULT false;

-- Allow admins to update ads (for overrides)
DO $$ BEGIN
  CREATE POLICY "Admins can update any ad" ON public.ads
    FOR UPDATE TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Atomic API key purchase: deducts 70 coins, returns the new key row id
CREATE OR REPLACE FUNCTION public.purchase_api_key(
  _name text,
  _key_prefix text,
  _key_hash text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _new_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  UPDATE public.profiles
     SET jagx_coins = jagx_coins - 70
   WHERE user_id = _uid AND jagx_coins >= 70;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient JagX coins. API keys cost 70 coins.';
  END IF;

  INSERT INTO public.api_keys (user_id, name, key_prefix, key_hash)
  VALUES (_uid, _name, _key_prefix, _key_hash)
  RETURNING id INTO _new_id;

  INSERT INTO public.coin_transactions (user_id, amount, transaction_type, status)
  VALUES (_uid, -70, 'api_key_purchase', 'completed');

  RETURN _new_id;
END $$;

GRANT EXECUTE ON FUNCTION public.purchase_api_key(text, text, text) TO authenticated;
