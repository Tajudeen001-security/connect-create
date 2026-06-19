
CREATE TABLE public.call_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id uuid NOT NULL,
  callee_id uuid NOT NULL,
  signal_type text NOT NULL,
  signal_data jsonb DEFAULT '{}'::jsonb,
  call_type text NOT NULL DEFAULT 'video',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.call_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their call signals" ON public.call_signals
  FOR SELECT TO authenticated
  USING (auth.uid() = caller_id OR auth.uid() = callee_id);

CREATE POLICY "Users can create call signals" ON public.call_signals
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = caller_id);

CREATE POLICY "Users can delete their call signals" ON public.call_signals
  FOR DELETE TO authenticated
  USING (auth.uid() = caller_id OR auth.uid() = callee_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.call_signals;
