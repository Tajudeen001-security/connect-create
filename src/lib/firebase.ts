// Firebase initialization for Web Push Notifications (FCM).
// Keys come from VITE_FIREBASE_* env vars (set in .env and on Vercel).
// These are publishable Firebase Web SDK keys — safe to ship to the browser.
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getMessaging, isSupported, type Messaging } from "firebase/messaging";

// Publishable Firebase web SDK keys — safe to ship in client code.
// Env vars take precedence so each deployment can override.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyApUO6jz27BFeQo6oR1u64yZ6APaE6xYCc",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "jagx-buddy-connect.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "jagx-buddy-connect",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "jagx-buddy-connect.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "152731352611",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:152731352611:web:00d6689df3d00a5ff27b96",
};

export const VAPID_KEY =
  (import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined) ||
  "BA5dWbm8dozenf5OmMEQ1CaczA8pGSUL49_wTqaSc4z1WPqC7Wpp7vXlI3p3_-yaAswW9d20OWyIxupKPEOM-KM";


let _app: FirebaseApp | null = null;
let _messaging: Messaging | null = null;

export function getFirebaseApp(): FirebaseApp | null {
  if (!firebaseConfig.apiKey) return null;
  if (_app) return _app;
  _app = getApps()[0] ?? initializeApp(firebaseConfig);
  return _app;
}

export async function getFirebaseMessaging(): Promise<Messaging | null> {
  if (typeof window === "undefined") return null;
  if (_messaging) return _messaging;
  try {
    const supported = await isSupported();
    if (!supported) return null;
    const app = getFirebaseApp();
    if (!app) return null;
    _messaging = getMessaging(app);
    return _messaging;
  } catch (e) {
    console.warn("[firebase] messaging unavailable:", e);
    return null;
  }
}
