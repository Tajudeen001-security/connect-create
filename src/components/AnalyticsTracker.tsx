import { useEffect } from "react";
import { useLocation } from "react-router-dom";

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
  }
}

const GA_ID = "G-LZWPQ1VYYN";

const AnalyticsTracker = () => {
  const location = useLocation();

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.gtag !== "function") return;
    if (localStorage.getItem("jagx_consent") !== "granted") return;
    const path = location.pathname + location.search;
    window.gtag("config", GA_ID, {
      page_path: path,
      page_title: document.title,
    });
    window.gtag("event", "page_view", {
      page_path: path,
      page_title: document.title,
      page_location: window.location.href,
    });
  }, [location.pathname, location.search]);

  return null;
};

export default AnalyticsTracker;