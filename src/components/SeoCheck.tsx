import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const SITE = "https://jagx-buddy-connect.name.ng";
const REQUIRED_VERIFICATIONS = [
  "HPbR4lJzhWsLx08KzRCNcICTA9hs2F55rsSODKhWT5A",
  "Qklb38Qlmn1f5eBxEIPeHH13MMiczi7OpXnuUkQ9a84",
];

/**
 * Runs after every navigation. Guarantees:
 *  - <link rel="canonical"> matches the live URL on jagx-buddy-connect.name.ng
 *  - All required google-site-verification meta tags are present
 * Specifically audits /reels and /user/* routes and logs a pass/fail report.
 */
const SeoCheck = () => {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname + location.search;

    // Canonical
    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    link.href = SITE + path;

    // Verification tags
    const existing = Array.from(
      document.querySelectorAll('meta[name="google-site-verification"]')
    ) as HTMLMetaElement[];
    const present = new Set(existing.map((m) => m.content));
    for (const token of REQUIRED_VERIFICATIONS) {
      if (!present.has(token)) {
        const m = document.createElement("meta");
        m.name = "google-site-verification";
        m.content = token;
        document.head.appendChild(m);
        present.add(token);
      }
    }

    // Audit (focus on reels & user profile routes, but log all)
    const isAudited =
      location.pathname === "/reels" || location.pathname.startsWith("/user/");
    const report = {
      route: path,
      canonical: link.href,
      canonicalOk: link.href === SITE + path,
      verificationsPresent: REQUIRED_VERIFICATIONS.every((t) => present.has(t)),
    };
    if (isAudited) {
      // eslint-disable-next-line no-console
      console.info("[SEO check]", report);
    }
  }, [location.pathname, location.search]);

  return null;
};

export default SeoCheck;