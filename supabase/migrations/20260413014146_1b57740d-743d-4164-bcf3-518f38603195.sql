
-- Allow users to delete their own sent messages
CREATE POLICY "Users can delete own messages" ON public.messages FOR DELETE USING (auth.uid() = sender_id);

-- Allow senders to update their own messages (for editing)
CREATE POLICY "Users can update own sent messages" ON public.messages FOR UPDATE USING (auth.uid() = sender_id);

-- Drop the old update policy that only let receivers update (for read receipts)
DROP POLICY IF EXISTS "Users can update messages they received" ON public.messages;

-- Re-create: allow both sender (edit) and receiver (read receipt) to update
CREATE POLICY "Users can update their messages" ON public.messages FOR UPDATE USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
