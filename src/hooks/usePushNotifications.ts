import { useCallback, useEffect, useState } from "react";
import { getToken, onMessage } from "firebase/messaging";
import { getFirebaseMessaging, VAPID_KEY } from "@/lib/firebase";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export type PushStatus =
  | "loading"
  | "unsupported"
  | "no-vapid"
  | "default"
  | "granted"
  | "denied"
  | "error";

function detectSupport(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof Notification === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;
  if (!("PushManager" in window)) return false;
  return true;
}

/**
 * Handles FCM web-push enrollment for the current user.
 *
 * Behavior: never auto-prompts the browser. On mount, if permission is already
 * granted, silently refreshes the token (handles token rotation across devices).
 * Call `enable()` from a user gesture to request permission and store a token.
 */
export function usePushNotifications() {
  const { user } = useAuth();
  const [status, setStatus] = useState<PushStatus>("loading");
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Initial status detection.
  useEffect(() => {
    if (!detectSupport()) {
      setStatus("unsupported");
      return;
    }
    if (!VAPID_KEY) {
      setStatus("no-vapid");
      return;
    }
    setStatus(Notification.permission as PushStatus);
  }, []);

  const registerToken = useCallback(
    async (opts?: { silent?: boolean }): Promise<string | null> => {
      if (!user) return null;
      if (!detectSupport() || !VAPID_KEY) return null;

      try {
        const swReg = await navigator.serviceWorker.register(
          "/firebase-messaging-sw.js",
          { scope: "/firebase-cloud-messaging-push-scope" },
        );
        const messaging = await getFirebaseMessaging();
        if (!messaging) return null;
        const tok = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: swReg,
        });
        if (!tok) return null;

        await (supabase as any).from("push_tokens").upsert(
          {
            user_id: user.id,
            token: tok,
            platform: "web",
            user_agent: navigator.userAgent,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "token" },
        );
        setToken(tok);
        return tok;
      } catch (e) {
        console.warn("[push] registerToken failed:", e);
        if (!opts?.silent) setStatus("error");
        return null;
      }
    },
    [user],
  );

  // If already granted, silently sync token on login.
  useEffect(() => {
    if (!user) return;
    if (status !== "granted") return;
    void registerToken({ silent: true });
  }, [user, status, registerToken]);

  // Foreground messages.
  useEffect(() => {
    if (status !== "granted") return;
    let off: (() => void) | undefined;
    (async () => {
      const messaging = await getFirebaseMessaging();
      if (!messaging) return;
      off = onMessage(messaging, (payload) => {
        const title = payload.notification?.title ?? "JagX Connect";
        const body = payload.notification?.body ?? "";
        toast(title, { description: body });
      });
    })();
    return () => off?.();
  }, [status]);

  const enable = useCallback(async (): Promise<PushStatus> => {
    if (!detectSupport()) {
      setStatus("unsupported");
      return "unsupported";
    }
    if (!VAPID_KEY) {
      setStatus("no-vapid");
      return "no-vapid";
    }
    if (!user) {
      toast.error("Sign in to enable notifications");
      return status;
    }
    setBusy(true);
    try {
      let perm: NotificationPermission = Notification.permission;
      if (perm === "default") perm = await Notification.requestPermission();
      setStatus(perm as PushStatus);
      if (perm !== "granted") {
        if (perm === "denied") {
          toast.error("Notifications blocked", {
            description: "Enable them in your browser site settings.",
          });
        }
        return perm as PushStatus;
      }
      const tok = await registerToken();
      if (tok) {
        toast.success("Notifications enabled");
        return "granted";
      }
      toast.error("Could not register for notifications");
      return "error";
    } finally {
      setBusy(false);
    }
  }, [user, status, registerToken]);

  return { status, token, busy, enable };
}

/** Background side-effect mount: silently syncs token when already granted. */
export function PushNotifications() {
  usePushNotifications();
  return null;
}
