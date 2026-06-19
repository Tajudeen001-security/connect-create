import { Bell, BellOff, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";

const DISMISS_KEY = "push_prompt_dismissed_at";
const DISMISS_DAYS = 7;

/**
 * Compact in-app banner that surfaces FCM push status and lets the user
 * enable notifications from a real click (required by browsers). Hides
 * itself when already granted, unsupported, or recently dismissed.
 */
export function NotificationPrompt({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const { status, busy, enable } = usePushNotifications();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      if (!raw) return;
      const ageDays = (Date.now() - Number(raw)) / 86_400_000;
      if (ageDays < DISMISS_DAYS) setDismissed(true);
    } catch {
      /* ignore */
    }
  }, []);

  if (!user) return null;
  if (status === "loading" || status === "granted") return null;
  if (status === "unsupported") return null;
  if (dismissed && status !== "denied") return null;

  const isDenied = status === "denied";
  const isMissingVapid = status === "no-vapid";

  const message = isMissingVapid
    ? "Push setup incomplete (missing VAPID key)."
    : isDenied
    ? "Notifications are blocked. Enable them in your browser site settings."
    : "Get notified about messages, follows, and live rooms.";

  const Icon = isDenied ? BellOff : status === "error" ? BellOff : Bell;

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border bg-card p-3 text-card-foreground shadow-sm ${
        compact ? "" : "mx-auto my-3 max-w-2xl"
      }`}
      role="status"
      aria-live="polite"
    >
      <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-tight">Enable notifications</p>
        <p className="text-xs text-muted-foreground leading-tight">{message}</p>
      </div>
      {!isDenied && !isMissingVapid && (
        <Button size="sm" onClick={enable} disabled={busy}>
          <BellRing className="mr-1 h-4 w-4" />
          {busy ? "Enabling…" : "Enable"}
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          try {
            localStorage.setItem(DISMISS_KEY, String(Date.now()));
          } catch {
            /* ignore */
          }
          setDismissed(true);
        }}
      >
        Dismiss
      </Button>
    </div>
  );
}

export default NotificationPrompt;
