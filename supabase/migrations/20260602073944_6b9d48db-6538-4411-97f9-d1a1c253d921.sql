-- 1. Groups
ALTER TABLE public.group_chats
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS invite_code text UNIQUE DEFAULT substr(md5(random()::text || clock_timestamp()::text), 1, 10);

UPDATE public.group_chats SET invite_code = substr(md5(random()::text || id::text), 1, 10) WHERE invite_code IS NULL;
ALTER TABLE public.group_chats ALTER COLUMN invite_code SET NOT NULL;

DROP POLICY IF EXISTS "Public groups viewable by anyone" ON public.group_chats;
CREATE POLICY "Public groups viewable by anyone"
  ON public.group_chats FOR SELECT
  USING (is_public = true);

GRANT SELECT ON public.group_chats TO anon;

-- 2. Withdrawal requests
CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount_coins integer NOT NULL,
  amount_naira integer NOT NULL,
  fee_coins integer NOT NULL DEFAULT 0,
  payout_coins integer NOT NULL,
  account_name text NOT NULL,
  account_number text NOT NULL,
  bank_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  admin_notes text,
  processed_by uuid,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.withdrawal_requests TO authenticated;
GRANT ALL ON public.withdrawal_requests TO service_role;

ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users insert own withdrawals" ON public.withdrawal_requests;
CREATE POLICY "Users insert own withdrawals"
  ON public.withdrawal_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users view own withdrawals" ON public.withdrawal_requests;
CREATE POLICY "Users view own withdrawals"
  ON public.withdrawal_requests FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins update withdrawals" ON public.withdrawal_requests;
CREATE POLICY "Admins update withdrawals"
  ON public.withdrawal_requests FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- 3. Triggers
CREATE OR REPLACE FUNCTION public.notify_withdrawal_decision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved','rejected','paid') THEN
    INSERT INTO public.notifications (user_id, from_user_id, type, content)
    VALUES (
      NEW.user_id, NEW.processed_by, 'withdrawal_' || NEW.status,
      CASE NEW.status
        WHEN 'approved' THEN 'Your withdrawal of ₦' || NEW.amount_naira || ' was approved'
        WHEN 'paid'     THEN 'Your withdrawal of ₦' || NEW.amount_naira || ' has been paid out'
        WHEN 'rejected' THEN 'Your withdrawal of ₦' || NEW.amount_naira || ' was rejected' || COALESCE(': ' || NEW.admin_notes, '')
        ELSE 'Withdrawal updated' END);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS withdrawal_decision_trg ON public.withdrawal_requests;
CREATE TRIGGER withdrawal_decision_trg AFTER UPDATE ON public.withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_withdrawal_decision();

CREATE OR REPLACE FUNCTION public.notify_verification_decision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved','rejected') THEN
    IF NEW.status = 'approved' THEN
      UPDATE public.profiles SET is_verified = true WHERE user_id = NEW.user_id;
    END IF;
    INSERT INTO public.notifications (user_id, type, content)
    VALUES (NEW.user_id, 'verification_' || NEW.status,
      CASE NEW.status
        WHEN 'approved' THEN 'Your verification badge has been approved 🐆'
        WHEN 'rejected' THEN 'Your verification request was rejected' END);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS verification_decision_trg ON public.verification_requests;
CREATE TRIGGER verification_decision_trg AFTER UPDATE ON public.verification_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_verification_decision();

DROP POLICY IF EXISTS "Admins update verification" ON public.verification_requests;
CREATE POLICY "Admins update verification"
  ON public.verification_requests FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins view all verification" ON public.verification_requests;
CREATE POLICY "Admins view all verification"
  ON public.verification_requests FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- 4. Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.withdrawal_requests;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.withdrawal_requests REPLICA IDENTITY FULL;