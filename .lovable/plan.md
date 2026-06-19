# Move to your own Supabase + polish pass

## 1. Personal Supabase migration (you run it, I prep the code)

### Codebase prep I'll do now
- Replace `lovable.auth.signInWithOAuth` with native `supabase.auth.signInWithOAuth("google", { redirectTo })` in `AuthPage.tsx`. Removes the `@/integrations/lovable` import — no more "Lovable" branding in the OAuth flow.
- Keep `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` as env vars so the only change after migration is editing `.env`.
- Add a `MIGRATION.md` at the repo root with the full export/import runbook (summarized below).

### Runbook you'll execute on your machine
```text
1. Create new Supabase project (pick region close to your users).
2. Install Supabase CLI:  npm i -g supabase
3. Link & push schema:
     supabase link --project-ref <NEW_REF>
     supabase db push           # replays everything in supabase/migrations/
4. Dump data from old project:
     pg_dump "$OLD_DB_URL" --data-only --no-owner --schema=public \
       --exclude-table=schema_migrations > data.sql
5. Load into new project:
     psql "$NEW_DB_URL" -f data.sql
6. Copy storage buckets (avatars, posts, receipts):
     supabase storage download --recursive ss://avatars ./avatars
     supabase storage upload   --recursive ./avatars ss://avatars
     (repeat for posts, receipts; mark avatars + posts public in new project)
7. Deploy edge functions:
     supabase functions deploy --project-ref <NEW_REF>
8. Set function secrets (RESEND_API_KEY, LIVEKIT_*, GOOGLE_SEARCH_CONSOLE_*,
   LOVABLE_API_KEY if you keep the AI gateway, OR your own OPENAI_API_KEY).
9. Update .env in this project:
     VITE_SUPABASE_URL=https://<NEW_REF>.supabase.co
     VITE_SUPABASE_PUBLISHABLE_KEY=<NEW_ANON_KEY>
     VITE_SUPABASE_PROJECT_ID=<NEW_REF>
10. Update vercel.json rewrites to point /p/:id and /u/:username at the new
    project's functions URL.
```

### Your own Google OAuth credentials (do this before step 9)
1. Google Cloud Console → APIs & Services → OAuth consent screen → External →
   App name "JagX Buddy Connect", support email = jagwazorld@gmail.com,
   authorized domains = your final domain.
2. Credentials → Create Credentials → OAuth Client ID → Web application.
3. Authorized redirect URI:  https://<NEW_REF>.supabase.co/auth/v1/callback
4. Copy Client ID + Secret → Supabase Dashboard → Authentication → Providers
   → Google → enable, paste both, save.

## 2. Account-security hardening
- Enable HIBP leaked-password check on the Supabase Auth config.
- Auth rate limiting: lives in Supabase dashboard (Auth → Rate Limits) — I'll
  document the recommended values in MIGRATION.md (sign-in 30/hr/IP, OTP 5/hr,
  password reset 5/hr).
- Session revocation UI: deferred per your scope (you didn't pick it). Say the
  word and I'll add /settings/sessions.

## 3. Stylish "Welcome back" overlay
New `<WelcomeBackOverlay />` mounted in `AppContent`:
- Listens to `onAuthStateChange("SIGNED_IN")`.
- Full-screen onyx backdrop with gold radial glow, avatar in a gold ring,
  "Welcome back, <Display Name>" in Playfair italic, animated gold underline
  sweep, auto-dismiss in 2.2s.
- Replaces the plain `toast.success("Welcome back!")` calls in AuthPage.

## 4. Unread jump + per-conversation badges
- `ChatPage` query: for each DM partner / group, count `messages` / `group_messages` where `is_read=false` AND `receiver_id=me` (DM) or `created_at > last_read_at` (group via new `group_reads` table).
- Render the count on the existing `ChatPreview` badge.
- On opening a DM/group, scroll to the first unread message with a thin gold
  "Unread messages" divider above it; if none, scroll to bottom (existing
  behavior).
- New tiny migration: `group_reads(user_id, group_id, last_read_at)` + RLS +
  GRANT (own rows only).

## Files I'll touch
- new: `MIGRATION.md`, `src/components/WelcomeBackOverlay.tsx`
- new migration: `group_reads` table + grants/RLS
- edit: `src/pages/AuthPage.tsx` (drop lovable.auth, use supabase.auth)
- edit: `src/App.tsx` (mount overlay)
- edit: `src/pages/ChatPage.tsx` (unread counts per row)
- edit: `src/pages/DirectMessagePage.tsx` and `src/pages/GroupChatPage.tsx`
  (jump-to-unread + divider, mark as read)
- Supabase auth config: enable HIBP

## Out of scope for this pass (per your selection)
- Session revocation UI
- Auth rate-limit tuning beyond documenting recommended values (dashboard-only)

Approve and I'll ship it.
