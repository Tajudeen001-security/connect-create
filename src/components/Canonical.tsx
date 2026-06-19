import { useEffect } from "react";

const SITE = "https://jagx-buddy-connect.name.ng";
const VERIFICATIONS = [
  "HPbR4lJzhWsLx08KzRCNcICTA9hs2F55rsSODKhWT5A",
  "Qklb38Qlmn1f5eBxEIPeHH13MMiczi7OpXnuUkQ9a84",
];

/**
 * Sets <link rel="canonical"> for the current page and re-asserts the Google
 * site-verification meta tag (in case any runtime code stripped it).
 * Pass an explicit `path` (e.g. "/reels?v=abc") to override window.location.
 */
export const Canonical = ({ path }: { path?: string }) => {
  useEffect(() => {
    const url = SITE + (path ?? (typeof window !== "undefined" ? window.location.pathname + window.location.search : "/"));

    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    link.href = url;

    // Ensure ALL Google verification tags are present (safety net) on every
    // client-side route change as well as hard refreshes.
    const existing = Array.from(
      document.querySelectorAll('meta[name="google-site-verification"]')
    ) as HTMLMetaElement[];
    const present = new Set(existing.map((m) => m.content));
    for (const token of VERIFICATIONS) {
      if (!present.has(token)) {
        const m = document.createElement("meta");
        m.name = "google-site-verification";
        m.content = token;
        document.head.appendChild(m);
      }
    }
  }, [path]);
  return null;
};

export default Canonical;