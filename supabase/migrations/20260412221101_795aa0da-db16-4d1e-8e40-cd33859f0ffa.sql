
CREATE TABLE public.stories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  media_url TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'image',
  caption TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '24 hours')
);

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stories viewable by everyone"
ON public.stories FOR SELECT USING (true);

CREATE POLICY "Users can create own stories"
ON public.stories FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own stories"
ON public.stories FOR DELETE
USING (auth.uid() = user_id);

CREATE TABLE public.story_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(story_id, viewer_id)
);

ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Story owners can see viewers"
ON public.story_views FOR SELECT
USING (EXISTS (SELECT 1 FROM public.stories WHERE stories.id = story_id AND stories.user_id = auth.uid()) OR auth.uid() = viewer_id);

CREATE POLICY "Users can record views"
ON public.story_views FOR INSERT
WITH CHECK (auth.uid() = viewer_id);

-- Function to notify story owner when someone views
CREATE OR REPLACE FUNCTION public.notify_story_view()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  story_owner UUID;
BEGIN
  SELECT user_id INTO story_owner FROM public.stories WHERE id = NEW.story_id;
  IF story_owner IS NOT NULL AND story_owner != NEW.viewer_id THEN
    INSERT INTO public.notifications (user_id, from_user_id, type, content)
    VALUES (story_owner, NEW.viewer_id, 'story_view', 'viewed your story');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_story_view
AFTER INSERT ON public.story_views
FOR EACH ROW
EXECUTE FUNCTION public.notify_story_view();
