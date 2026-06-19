/* Firebase Cloud Messaging service worker.
 * MUST live at /firebase-messaging-sw.js (root scope) for FCM to find it.
 * Keep config values here — Firebase Web SDK keys are publishable.
 */
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyApUO6jz27BFeQo6oR1u64yZ6APaE6xYCc",
  authDomain: "jagx-buddy-connect.firebaseapp.com",
  projectId: "jagx-buddy-connect",
  storageBucket: "jagx-buddy-connect.firebasestorage.app",
  messagingSenderId: "152731352611",
  appId: "1:152731352611:web:00d6689df3d00a5ff27b96",
});

const messaging = firebase.messaging();

// Allowed in-app deep link routes. Keep in sync with src/App.tsx routes.
const ALLOWED_ROUTES = [
  "/", "/reels", "/chat", "/profile", "/create", "/coins", "/live",
  "/discover", "/notifications", "/ai-chat", "/edit-profile", "/earnings",
  "/ads", "/admin", "/developer", "/privacy", "/terms", "/groups",
];
const ALLOWED_PREFIXES = ["/dm/", "/user/", "/group/", "/post/", "/p/", "/g/", "/admin/"];

function sanitizeDeepLink(raw) {
  if (!raw || typeof raw !== "string") return "/";
  // Reject protocol-relative or absolute external URLs.
  if (raw.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    try {
      const u = new URL(raw);
      if (u.origin !== self.location.origin) return "/";
      raw = u.pathname + u.search + u.hash;
    } catch {
      return "/";
    }
  }
  if (!raw.startsWith("/")) return "/";
  const path = raw.split("?")[0].split("#")[0];
  if (ALLOWED_ROUTES.includes(path)) return raw;
  if (ALLOWED_PREFIXES.some((p) => path.startsWith(p) && path.length > p.length)) return raw;
  return "/";
}

function resolveUrl(data, notification) {
  // Prefer explicit data.url; fall back to fcm_options.link in webpush.
  const candidates = [
    data && data.url,
    data && data.link,
    notification && notification.click_action,
  ].filter(Boolean);
  return sanitizeDeepLink(candidates[0] || "/");
}

messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || "JagX Connect";
  const data = payload.data || {};
  const url = resolveUrl(data, payload.notification);
  const options = {
    body: (payload.notification && payload.notification.body) || "",
    icon: "/image-5 (1).jpg",
    badge: "/image-5 (1).jpg",
    data: { ...data, url },
  };
  self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetPath = sanitizeDeepLink(data.url || "/");
  const targetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clientList) {
      try {
        const clientOrigin = new URL(client.url).origin;
        if (clientOrigin !== self.location.origin) continue;
        // Tell the SPA to route via postMessage (no full reload).
        client.postMessage({ type: "PUSH_NAVIGATE", url: targetPath, data });
        return client.focus();
      } catch {
        /* ignore */
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
  })());
});
