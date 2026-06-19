import { useEffect, useState } from "react";
import { ExternalLink, Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Ad {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  link_url: string | null;
  user_id: string;
  impressions: number;
  placement_section: string;
  placement_frequency: number;
  admin_section: string | null;
  admin_frequency: number | null;
  admin_override: boolean;
}

interface FeedAdProps {
  /** 1-based index of the post this slot follows */
  position: number;
  /** Which feed this slot lives in */
  section?: "home" | "reels";
}

const FeedAd = ({ position, section = "home" }: FeedAdProps) => {
  const [ad, setAd] = useState<Ad | null>(null);

  useEffect(() => {
    loadAd();
  }, [position, section]);

  const loadAd = async () => {
    const { data } = await supabase
      .from("ads")
      .select("id, title, description, image_url, link_url, user_id, impressions, placement_section, placement_frequency, admin_section, admin_frequency, admin_override")
      .eq("status", "active")
      .lt("impressions", 1000)
      .gte("expires_at", new Date().toISOString())
      .limit(30);

    if (!data || data.length === 0) return;

    // Filter to ads whose placement matches this slot
    const matches = (data as Ad[]).filter((a) => {
      const sec = a.admin_override && a.admin_section ? a.admin_section : a.placement_section;
      const freq = a.admin_override && a.admin_frequency ? a.admin_frequency : a.placement_frequency;
      const sectionMatch = sec === "both" || sec === section;
      const freqMatch = freq > 0 && position % freq === 0;
      return sectionMatch && freqMatch;
    });
    if (matches.length === 0) return;
    const picked = matches[Math.floor(Math.random() * matches.length)];
    setAd(picked);

    // Track impression
    await supabase.from("ads").update({ impressions: picked.impressions + 1 }).eq("id", picked.id);
  };

  const handleClick = () => {
    if (ad?.link_url) {
      window.open(ad.link_url, "_blank");
    }
  };

  if (!ad) return null;

  return (
    <div className="border-y border-gold/30 bg-gold/5 pb-4 my-2 relative">
      <div className="px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Megaphone className="size-3 text-gold" />
          <span className="text-[10px] uppercase tracking-widest text-gold font-bold">Sponsored · Ad</span>
        </div>
        <span className="text-[9px] text-muted-foreground">Paid with JagX Coins</span>
      </div>
      <button onClick={handleClick} className="w-full text-left">
        {ad.image_url && (
          <div className="aspect-video bg-surface overflow-hidden">
            <img src={ad.image_url} alt={ad.title} className="w-full h-full object-cover" loading="lazy" />
          </div>
        )}
        <div className="px-4 pt-3">
          <p className="text-sm font-semibold text-champagne">{ad.title}</p>
          {ad.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{ad.description}</p>}
          {ad.link_url && (
            <div className="flex items-center gap-1 mt-2 text-gold text-xs">
              <ExternalLink className="size-3" /> Learn more
            </div>
          )}
        </div>
      </button>
    </div>
  );
};

export default FeedAd;
