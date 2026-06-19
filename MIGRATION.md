# Migrate JagX Connect to your own Supabase

You no longer want to live on Lovable Cloud's managed Supabase — this guide
moves every table, row, file and edge function to a Supabase project you own.
Run every command on your own machine (not in Lovable). When you finish, the
only change in this codebase is a new `.env`.

---

## 0. Prereqs

```bash
npm install -g supabase
# also needed: psql + pg_dump (brew install libpq  /  apt install postgresql-client)
```

Create a new Supabase project: https://supabase.com/dashboard → New project.
Pick the region closest to your users (Nigeria → `eu-west-2` London).

Grab from the NEW project:
- Project ref (in dashboard URL)
- Anon (publishable) key — Settings → API
- DB connection string — Settings → Database → Connection string → URI

Grab from the OLD (Lovable Cloud) project:
- DB connection string + service role key — these are NOT exposed in the Cloud
  UI; email Lovable support for a one-time read-only dump URL.

```bash
export OLD_DB_URL='postgres://...from Lovable support...'
export NEW_DB_URL='postgres://postgres.<NEW_REF>:<NEW_PW>@<host>:5432/postgres'
export NEW_REF='xxxxxxxx'
```

---

## 1. Push the schema

```bash
supabase login
supabase link --project-ref "$NEW_REF"
supabase db push        # replays supabase/migrations/
```

## 2. Move the data

```bash
pg_dump "$OLD_DB_URL" --data-only --no-owner --no-privileges \
  --schema=public \
  --exclude-table=schema_migrations \
  --exclude-table=supabase_migrations > data.sql

psql "$NEW_DB_URL" -c "SET session_replication_role = 'replica';"
psql "$NEW_DB_URL" -f data.sql
psql "$NEW_DB_URL" -c "SET session_replication_role = 'origin';"
```

`auth.users` is managed by Supabase; export and replay separately:

```bash
supabase db dump --db-url "$OLD_DB_URL" --data-only --schema auth -f auth.sql
psql "$NEW_DB_URL" -f auth.sql
```

If you have only a handful of users, ask them to re-sign-up instead — simpler.

## 3. Move storage

Buckets: `avatars` (public), `posts` (public), `receipts` (private).

```bash
for B in avatars posts receipts; do
  mkdir -p "./$B"
  supabase storage download --recursive "ss:///$B" "./$B"
done
supabase link --project-ref "$NEW_REF"
for B in avatars posts receipts; do
  supabase storage upload --recursive "./$B" "ss:///$B"
done
```

In the new dashboard → Storage, mark `avatars` and `posts` Public. Leave
`receipts` Private.

## 4. Deploy edge functions

```bash
supabase functions deploy --project-ref "$NEW_REF"
```

Set function secrets (Dashboard → Edge Functions → Secrets):

| Secret                    | Source                                   |
| ------------------------- | ---------------------------------------- |
| `RESEND_API_KEY`          | resend.com                               |
| `LIVEKIT_WS_URL`          | livekit.io                               |
| `LIVEKIT_API_KEY`         | livekit.io                               |
| `LIVEKIT_API_SECRET`      | livekit.io                               |
| `LOVABLE_API_KEY`         | Optional — keep only if you reuse the    |
|                           | Lovable AI gateway. Otherwise rewrite    |
|                           | `supabase/functions/ai-chat` to call     |
|                           | OpenAI/Gemini with your own key.         |
| `GOOGLE_SEARCH_CONSOLE_*` | Already documented in the code           |

## 5. Account security (new project's dashboard)

Authentication → Providers → Email:
- Enable **Confirm email**
- Enable **Password HIBP** (leaked-password check)
- Min password length: 8

Authentication → Rate Limits (recommended values):
- Sign-ins per IP / hour:           30
- OTPs per email / hour:            5
- Password resets per email / hour: 5
- Sign-ups per IP / hour:           10

## 6. Your own Google OAuth credentials

1. https://console.cloud.google.com → create a project.
2. APIs & Services → **OAuth consent screen** → External:
   - App name: `JagX Buddy Connect`
   - Support email: `jagwazorld@gmail.com`
   - Authorized domains: your final domain + `supabase.co`
   - Scopes: `email`, `profile`, `openid`
   - Publish (or add yourself as tester).
3. APIs & Services → **Credentials** → Create credentials → OAuth client ID:
   - Type: **Web application**
   - JavaScript origins: `http://localhost:8080`, `https://<your-domain>`
   - Redirect URI: `https://<NEW_REF>.supabase.co/auth/v1/callback`
   - Copy Client ID + Client Secret.
4. Dashboard → Authentication → Providers → **Google** → enable, paste both,
   save.

The frontend already calls `supabase.auth.signInWithOAuth("google", ...)` —
nothing else to change. No Lovable branding on the OAuth screen.

## 7. Swap the frontend

Edit `.env`:

```
VITE_SUPABASE_URL=https://<NEW_REF>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<NEW_ANON_KEY>
VITE_SUPABASE_PROJECT_ID=<NEW_REF>
```

Update `vercel.json` — replace the old project ref (`tmmeymhaxkrvngjfhave`)
with `<NEW_REF>` so `/p/:id` and `/u/:username` rewrites hit your project.

Redeploy. Sign in. Done.

## 8. Smoke test before retiring the old project

- Email/password sign-in (existing user)
- Google sign-in (new user)
- Send a DM (realtime works)
- View a profile (avatar loads → storage healthy)
- Buy JagX coins (OPay receipt uploads → receipts bucket)

Only after all five pass, retire the old project.
