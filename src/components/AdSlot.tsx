import { useEffect, useRef } from "react";

// Google AdSense in-feed slot. The <script> tag itself lives in index.html.
// Each <AdSlot/> instance pushes one slot to the adsbygoogle queue on mount.
// Per AdSense ToS we only render this between organic content (every 5 reels).

declare global {
  interface Window { adsbygoogle?: unknown[] }
}

interface AdSlotProps {
  slot?: string;             // ad slot id from AdSense dashboard
  format?: string;           // 'auto' | 'fluid' | etc.
  layout?: string;           // for in-article / in-feed
  className?: string;
  style?: React.CSSProperties;
}

const AdSlot = ({ slot = "auto", format = "auto", layout, className, style }: AdSlotProps) => {
  const ref = useRef<HTMLModElement | null>(null);

  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      }
    } catch (e) {
      console.debug("AdSense push skipped", e);
    }
  }, []);

  return (
    <ins
      ref={ref as any}
      className={`adsbygoogle ${className ?? ""}`}
      style={{ display: "block", ...style }}
      data-ad-client="ca-pub-6037723607677223"
      data-ad-slot={slot}
      data-ad-format={format}
      {...(layout ? { "data-ad-layout": layout } : {})}
      data-full-width-responsive="true"
    />
  );
};

export default AdSlot;