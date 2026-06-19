CREATE TABLE public.group_reads (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.group_chats(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, group_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_reads TO authenticated;
GRANT ALL ON public.group_reads TO service_role;
ALTER TABLE public.group_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own group reads select" ON public.group_reads FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own group reads upsert" ON public.group_reads FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own group reads update" ON public.group_reads FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own group reads delete" ON public.group_reads FOR DELETE TO authenticated USING (auth.uid() = user_id);