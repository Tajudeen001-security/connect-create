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

messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || "JagX Connect";
  const options = {
    body: (payload.notification && payload.notification.body) || "",
    icon: "/image-5 (1).jpg",
    badge: "/image-5 (1).jpg",
    data: payload.data || {},
  };
  self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
