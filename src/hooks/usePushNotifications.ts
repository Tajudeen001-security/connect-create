import { useEffect, useState } from "react";
import { getToken, onMessage } from "firebase/messaging";
import { getFirebaseMessaging, VAPID_KEY } from "@/lib/firebase";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

/**
 * Registers the FCM service worker, requests permission, gets a token,
 * and stores it in `public.push_tokens` for the current user. Also wires a
 * foreground message handler that surfaces a toast.
 *
 * Call <PushNotifications /> or use this hook anywhere inside an authed page.
 */
export function usePushNotifications() {
  const { user } = useAuth();
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported",
  );
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    if (typeof Notification === "undefined" || typeof navigator === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (!VAPID_KEY) {
      console.warn("[push] VITE_FIREBASE_VAPID_KEY not set; push disabled.");
      return;
    }

    let unsubscribe: (() => void) | undefined;

    (async () => {
      try {
        // Register the Firebase messaging service worker.
        const swReg = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
          scope: "/firebase-cloud-messaging-push-scope",
        });

        // Ask permission only if not already decided.
        let perm = Notification.permission;
        if (perm === "default") perm = await Notification.requestPermission();
        setPermission(perm);
        if (perm !== "granted") return;

        const messaging = await getFirebaseMessaging();
        if (!messaging) return;

        const tok = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: swReg,
        });
        if (!tok) return;
        setToken(tok);

        await supabase.from("push_tokens").upsert(
          {
            user_id: user.id,
            token: tok,
            platform: "web",
            user_agent: navigator.userAgent,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "token" },
        );

        const off = onMessage(messaging, (payload) => {
          const title = payload.notification?.title ?? "JagX Connect";
          const body = payload.notification?.body ?? "";
          toast(title, { description: body });
        });
        unsubscribe = off;
      } catch (e) {
        console.warn("[push] setup failed:", e);
      }
    })();

    return () => {
      unsubscribe?.();
    };
  }, [user]);

  return { permission, token };
}

/** Mount-only side-effect component you can drop into the app shell. */
export function PushNotifications() {
  usePushNotifications();
  return null;
}
