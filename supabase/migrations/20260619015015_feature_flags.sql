-- Feature flags + app config (admin-controlled, realtime to all users)

CREATE TABLE IF NOT EXISTS public.feature_flags (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text,
  enabled boolean NOT NULL DEFAULT false,
  category text DEFAULT 'general',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

GRANT SELECT ON public.feature_flags TO anon, authenticated;
GRANT ALL ON public.feature_flags TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.feature_flags TO authenticated;

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "flags_read_all" ON public.feature_flags;
CREATE POLICY "flags_read_all" ON public.feature_flags FOR SELECT USING (true);

DROP POLICY IF EXISTS "flags_admin_write" ON public.feature_flags;
CREATE POLICY "flags_admin_write" ON public.feature_flags FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.app_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_config TO anon, authenticated;
GRANT ALL ON public.app_config TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.app_config TO authenticated;

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "config_read_all" ON public.app_config;
CREATE POLICY "config_read_all" ON public.app_config FOR SELECT USING (true);

DROP POLICY IF EXISTS "config_admin_write" ON public.app_config;
CREATE POLICY "config_admin_write" ON public.app_config FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.feature_flags;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.app_config;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO public.feature_flags (key, label, description, enabled, category) VALUES
  ('dark_mode',        'Dark Mode',           'Switch between light and dark themes',         true,  'ui'),
  ('stories',          'Stories',             '24-hour disappearing stories',                 true,  'content'),
  ('reels',            'Reels',               'Short vertical video feed',                    true,  'content'),
  ('live_streaming',   'Live Streaming',      'Go live to followers',                         true,  'content'),
  ('coin_gifts',       'JagX Coin Gifts',     'Send gifts during live & on posts',            true,  'monetization'),
  ('polls',            'Polls',               'Create polls inside posts',                    true,  'content'),
  ('ai_chat',          'JagX AI Chat',        'Chat with the JagX AI assistant',              true,  'ai'),
  ('verification',     'Verified Badge',      'Request blue-check verification',              true,  'account'),
  ('group_chats',      'Group Chats',         'Create and join group conversations',          true,  'messaging'),
  ('voice_notes',      'Voice Notes',         'Record and send voice messages',               false, 'messaging'),
  ('video_calls',      'Video Calls',         '1-on-1 video calling',                         true,  'messaging'),
  ('file_sharing',     'File Sharing',        'Send files in DMs',                            false, 'messaging'),
  ('location_share',   'Location Sharing',    'Share live location in chats',                 false, 'messaging'),
  ('story_reactions',  'Story Reactions',     'React to stories with emojis',                 true,  'content'),
  ('post_scheduling',  'Post Scheduling',     'Schedule posts to publish later',              false, 'content'),
  ('drafts',           'Drafts',              'Save posts as drafts',                         true,  'content'),
  ('bookmarks',        'Bookmarks',           'Save posts to read later',                     true,  'content'),
  ('close_friends',    'Close Friends',       'Share to a private friends-only list',         false, 'social'),
  ('mute_users',       'Mute Users',          'Mute users without unfollowing',               true,  'social'),
  ('block_users',      'Block Users',         'Block abusive users',                          true,  'social'),
  ('report_content',   'Report Content',      'Report posts and accounts',                    true,  'safety'),
  ('two_factor',       'Two-Factor Auth',     'Extra login security',                         false, 'security'),
  ('login_alerts',     'Login Alerts',        'Email when new device signs in',               false, 'security'),
  ('data_export',      'Data Export',         'Download all your data',                       false, 'account'),
  ('theme_picker',     'Theme Picker',        'Pick from multiple color themes',              false, 'ui'),
  ('font_size',        'Font Size Control',   'Adjust app font size',                         false, 'ui'),
  ('translations',     'Translations',        'Translate posts to your language',             false, 'ai'),
  ('sound_effects',    'Sound Effects',       'UI sound effects',                             false, 'ui'),
  ('animations',       'Animations',          'Smooth UI animations',                         true,  'ui'),
  ('beta_features',    'Beta Features',       'Try experimental features early',              false, 'general')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.app_config (key, value) VALUES
  ('version', '"3.0"'::jsonb),
  ('announcement', '""'::jsonb)
ON CONFLICT (key) DO NOTHING;
