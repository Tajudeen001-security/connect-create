# Admin Features Panel — Setup

You answered:
- Role-based admin (sign up jagwazorld@gmail.com normally; auto-promoted)
- All 30 feature flags + realtime toasts
- Manifest-only PWA (installable)

## 1. Run the migration on your Supabase

Open Supabase Dashboard → **SQL Editor** → paste the contents of
`supabase/migrations/20260619015015_feature_flags.sql` → **Run**.

This creates:
- `feature_flags` table (30 features pre-seeded)
- `app_config` table (`version` + `announcement` keys)
- RLS: anyone can read, only admins can write
- Realtime publication on both tables

## 2. Sign in as admin

1. Sign up at `/auth` with **jagwazorld@gmail.com** / your password.
2. Open `/admin` once — the page auto-promotes you to the `admin` role.
3. From now on only that account can toggle features.

## 3. Use the Admin Panel

`/admin` → **Features** tab:
- **App Version** — change "3.0" to "3.1" etc. → every online user gets a toast.
- **Global Announcement** — broadcast a message to everyone live.
- **30 toggles** — flip any feature on/off. Turning one ON shows "✨ New feature: X" toast to every user in real time.

## 4. PWA install

Already wired. Users on Chrome/Edge see an Install button in the address bar;
iPhone users tap Share → Add to Home Screen. No service worker (no stale-cache issues).

## 5. Gate UI by a flag

```tsx
import { useFeature } from "@/hooks/useFeatureFlags";

function MyComponent() {
  const liveOn = useFeature("live_streaming");
  if (!liveOn) return null;
  return <GoLiveButton />;
}
```
