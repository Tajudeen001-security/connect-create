-- Gift payout ledger view aggregating gifts into a ledger of debits/credits
CREATE OR REPLACE VIEW public.gift_ledger AS
SELECT 
  g.id as gift_id,
  g.created_at,
  g.sender_id,
  g.recipient_id,
  g.coin_amount as debit_amount,
  g.creator_amount as credit_amount,
  g.platform_fee,
  g.gift_type,
  g.post_id,
  g.live_stream_id,
  s.username as sender_username,
  s.display_name as sender_display_name,
  r.username as recipient_username,
  r.display_name as recipient_display_name
FROM public.gifts g
LEFT JOIN public.profiles s ON s.user_id = g.sender_id
LEFT JOIN public.profiles r ON r.user_id = g.recipient_id;

-- Allow admins to view all gift records via a new policy on gifts
DROP POLICY IF EXISTS "Admins can view all gifts" ON public.gifts;
CREATE POLICY "Admins can view all gifts"
ON public.gifts
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Add a co_hosts table to track invited co-hosts on a live stream
CREATE TABLE IF NOT EXISTS public.live_co_hosts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  live_stream_id uuid NOT NULL REFERENCES public.live_streams(id) ON DELETE CASCADE,
  host_id uuid NOT NULL,
  co_host_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending | accepted | declined | ended
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (live_stream_id, co_host_id)
);

ALTER TABLE public.live_co_hosts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Co-host invites viewable by participants"
ON public.live_co_hosts FOR SELECT
USING (auth.uid() = host_id OR auth.uid() = co_host_id);

CREATE POLICY "Hosts can invite co-hosts"
ON public.live_co_hosts FOR INSERT
WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Participants can update co-host status"
ON public.live_co_hosts FOR UPDATE
USING (auth.uid() = host_id OR auth.uid() = co_host_id);

CREATE POLICY "Hosts can remove co-hosts"
ON public.live_co_hosts FOR DELETE
USING (auth.uid() = host_id);

CREATE TRIGGER update_live_co_hosts_updated_at
BEFORE UPDATE ON public.live_co_hosts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.live_co_hosts;