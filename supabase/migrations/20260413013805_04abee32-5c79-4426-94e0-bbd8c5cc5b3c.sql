
-- Create gifts table
CREATE TABLE public.gifts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID NOT NULL,
  recipient_id UUID NOT NULL,
  post_id UUID REFERENCES public.posts(id) ON DELETE SET NULL,
  live_stream_id UUID REFERENCES public.live_streams(id) ON DELETE SET NULL,
  coin_amount INTEGER NOT NULL,
  platform_fee INTEGER NOT NULL DEFAULT 0,
  creator_amount INTEGER NOT NULL DEFAULT 0,
  gift_type TEXT NOT NULL DEFAULT 'post',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.gifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gifts viewable by involved users" ON public.gifts FOR SELECT USING (
  auth.uid() = sender_id OR auth.uid() = recipient_id
);

CREATE POLICY "Users can send gifts" ON public.gifts FOR INSERT WITH CHECK (
  auth.uid() = sender_id
);

-- Trigger to calculate platform fee (30%) and creator amount (70%)
CREATE OR REPLACE FUNCTION public.calculate_gift_fee()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.platform_fee := FLOOR(NEW.coin_amount * 0.3);
  NEW.creator_amount := NEW.coin_amount - NEW.platform_fee;
  
  -- Deduct coins from sender
  UPDATE public.profiles SET jagx_coins = jagx_coins - NEW.coin_amount WHERE user_id = NEW.sender_id AND jagx_coins >= NEW.coin_amount;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient coins';
  END IF;
  
  -- Credit creator
  UPDATE public.profiles SET jagx_coins = jagx_coins + NEW.creator_amount WHERE user_id = NEW.recipient_id;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER gift_fee_calculation
  BEFORE INSERT ON public.gifts
  FOR EACH ROW
  EXECUTE FUNCTION public.calculate_gift_fee();

-- Update handle_new_user to give next 5 accounts 50 coins (first 6 already got auto-verified)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_count INTEGER;
  initial_coins INTEGER := 0;
BEGIN
  SELECT COUNT(*) INTO profile_count FROM public.profiles;
  -- Next 5 accounts after the first 6 get 50 coins
  IF profile_count >= 6 AND profile_count < 11 THEN
    initial_coins := 50;
  END IF;
  
  INSERT INTO public.profiles (user_id, username, display_name, jagx_coins)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'username', NEW.raw_user_meta_data->>'display_name', initial_coins);
  RETURN NEW;
END;
$$;

-- Enable realtime for gifts
ALTER PUBLICATION supabase_realtime ADD TABLE public.gifts;
