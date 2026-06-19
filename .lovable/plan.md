## Reality check

Your request bundles many large items together. I'll be honest about what's realistic per turn so we don't end up with a broken app.

- **"100 new admin features"** — not feasible in one shot. I'll build a real admin foundation (role-based admin, settings table, dynamic theming, user ban, feature flags, content moderation, video promotion) and we'll add specific features iteratively as you name them.
- **Hardcoded admin password `12345Taju`** — I will **not** hardcode that. It's unsafe (anyone reading your code would have admin). Instead: sign up `jagwazorld@gmail.com` normally through your auth page, and a migration will grant that email the `admin` role automatically. You keep using your own password.
- **".env stays as-is"** — confirmed, I won't touch your Supabase env. I'll add the Firebase keys you pasted as new `VITE_FIREBASE_*` vars in `.env.example` and tell you to mirror them in Vercel.
- **Vercel hosting on your domain** — your zip already has `vercel.json`. I'll keep it. You connect the domain in Vercel UI; nothing in code changes.
- **"Don't use Lovable Cloud for files/users"** — confirmed, we'll keep using **your own Supabase** that's already wired in `.env`. Lovable AI Gateway (just an API for AI calls) is separate from Lovable Cloud storage and is fine to use.

## Phase 1 — this turn (foundation + critical fixes)

1. **Import your project**: copy the zip over the current TanStack template, delete TanStack-only files, install deps.
2. **Fix blank screen**: add a global ErrorBoundary so any single component failure doesn't white-screen the whole app + a `useAuthReady` hook to gate queries until Supabase session restores.
3. **Fix profile editing**: audit the profile page, ensure update writes to `profiles` table with proper `user_id` and RLS-compliant payload.
4. **Switch AI from Gemini → Lovable AI**: replace the Gemini SDK calls with `fetch` against `https://ai.gateway.lovable.dev/v1/chat/completions` using `LOVABLE_API_KEY` (server-side via a small Supabase Edge Function so the key never ships to the browser). Default model: `google/gemini-3-flash-preview`.
5. **Admin role + scaffolding**:
   - `app_role` enum + `user_roles` table + `has_role()` SECURITY DEFINER function (the only safe pattern).
   - Migration auto-grants `admin` to `jagwazorld@gmail.com` on signup via trigger.
   - `/admin` route gated by `has_role(uid, 'admin')`.
   - Admin can: ban/unban users, toggle feature flags, edit theme colors stored in a `app_settings` table, promote videos (boolean column).
6. **Group creation fix**: read your current group code + RLS, identify the failure (most often missing `created_by = auth.uid()` or RLS policy gap), patch it.
7. **PWA push notifications via Firebase**:
   - Add `firebase` + `firebase/messaging` packages.
   - Create `public/firebase-messaging-sw.js` (separate from any existing app service worker — required for FCM background).
   - Add a `useFcmToken()` hook that requests permission, gets the token with your VAPID key, and stores it in a new `push_tokens` table.
   - **You'll need to add Firebase keys to Vercel env vars yourself** (I'll print the list).

## Phase 2 — next turns (after Phase 1 lands cleanly)

- Theme editor UI for admin (live color picker → updates `app_settings` → CSS vars).
- Feature flag toggle UI.
- Video promotion management (pin/boost/expire).
- Content moderation queue (reported posts).
- Then we tackle your specific feature list one batch at a time.

## Notes (technical)

- **Stack swap**: current Lovable preview is TanStack Start. Replacing with your Vite/React Router app means the preview will rebuild from scratch — expect ~1 min before it shows your real app.
- **Firebase service worker**: lives at `public/firebase-messaging-sw.js`, NOT in the PWA cache worker. Push works only on HTTPS — fine on Vercel and Lovable preview.
- **No hardcoded credentials**: admin is identified by email + role row, not by a password literal in code.
- **AI key**: `LOVABLE_API_KEY` will be auto-provisioned; AI calls go through a Supabase Edge Function so the key stays server-side.

Reply **"go phase 1"** (or with edits) and I'll start importing and fixing.
