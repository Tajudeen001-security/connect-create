import { useEffect, useState } from "react";
import { Cookie, X } from "lucide-react";

const STORAGE_KEY = "jagx_consent";

declare global {
  interface Window { gtag?: (...args: any[]) => void; }
}

const updateConsent = (granted: boolean) => {
  localStorage.setItem(STORAGE_KEY, granted ? "granted" : "denied");
  if (typeof window.gtag === "function") {
    window.gtag("consent", "update", {
      ad_storage: granted ? "granted" : "denied",
      ad_user_data: granted ? "granted" : "denied",
      ad_personalization: granted ? "granted" : "denied",
      analytics_storage: granted ? "granted" : "denied",
    });
  }
};

export const setConsent = updateConsent;

const CookieConsent = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) setVisible(true);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] p-3 pb-safe">
      <div className="mx-auto max-w-md rounded-2xl border border-gold/30 bg-background/95 backdrop-blur-xl shadow-2xl p-4 space-y-3">
        <div className="flex items-start gap-3">
          <Cookie className="size-5 text-gold flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Cookies & Analytics</p>
            <p className="text-xs text-muted-foreground mt-1">
              We use cookies and Google Analytics to improve JagX. Analytics is off until you accept.
              You can change this anytime in Settings.
            </p>
          </div>
          <button onClick={() => { updateConsent(false); setVisible(false); }} className="text-muted-foreground" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { updateConsent(false); setVisible(false); }}
            className="flex-1 py-2 rounded-xl bg-surface border border-border text-xs font-bold uppercase tracking-widest text-foreground"
          >
            Reject
          </button>
          <button
            onClick={() => { updateConsent(true); setVisible(false); }}
            className="flex-1 py-2 rounded-xl gold-gradient text-primary-foreground text-xs font-bold uppercase tracking-widest"
          >
            Accept All
          </button>
        </div>
      </div>
    </div>
  );
};

export default CookieConsent;