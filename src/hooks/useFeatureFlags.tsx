import { createContext, useContext, useEffect, useState, ReactNode, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface FeatureFlag {
  key: string;
  label: string;
  description: string | null;
  enabled: boolean;
  category: string | null;
}

interface FeatureFlagsContextValue {
  flags: Record<string, FeatureFlag>;
  version: string;
  announcement: string;
  isEnabled: (key: string) => boolean;
  loading: boolean;
}

const FeatureFlagsContext = createContext<FeatureFlagsContextValue>({
  flags: {},
  version: "3.0",
  announcement: "",
  isEnabled: () => true,
  loading: true,
});

export const useFeatureFlags = () => useContext(FeatureFlagsContext);
export const useFeature = (key: string) => useFeatureFlags().isEnabled(key);

export const FeatureFlagsProvider = ({ children }: { children: ReactNode }) => {
  const [flags, setFlags] = useState<Record<string, FeatureFlag>>({});
  const [version, setVersion] = useState("3.0");
  const [announcement, setAnnouncement] = useState("");
  const [loading, setLoading] = useState(true);
  const prevFlagsRef = useRef<Record<string, boolean>>({});
  const initialized = useRef(false);

  const applyFlags = (rows: FeatureFlag[]) => {
    const next: Record<string, FeatureFlag> = {};
    rows.forEach(r => { next[r.key] = r; });

    if (initialized.current) {
      Object.values(next).forEach(f => {
        const wasEnabled = prevFlagsRef.current[f.key];
        if (wasEnabled === false && f.enabled === true) {
          toast.success(`✨ New feature: ${f.label}`, {
            description: f.description || "Tap to explore",
            duration: 6000,
          });
        }
      });
    }
    prevFlagsRef.current = Object.fromEntries(Object.values(next).map(f => [f.key, f.enabled]));
    setFlags(next);
    initialized.current = true;
  };

  useEffect(() => {
    let mounted = true;

    (async () => {
      const [{ data: flagsData }, { data: cfgData }] = await Promise.all([
        supabase.from("feature_flags" as any).select("*"),
        supabase.from("app_config" as any).select("*"),
      ]);
      if (!mounted) return;
      if (flagsData) applyFlags(flagsData as any);
      if (cfgData) {
        const map: Record<string, any> = {};
        (cfgData as any[]).forEach(c => { map[c.key] = c.value; });
        if (map.version) setVersion(String(map.version));
        if (map.announcement) setAnnouncement(String(map.announcement));
      }
      setLoading(false);
    })();

    const ch = supabase
      .channel("feature-flags-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "feature_flags" }, async () => {
        const { data } = await supabase.from("feature_flags" as any).select("*");
        if (data) applyFlags(data as any);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "app_config" }, (payload: any) => {
        const row = payload.new;
        if (!row) return;
        if (row.key === "version") {
          const newV = String(row.value).replace(/"/g, "");
          setVersion(prev => {
            if (prev !== newV) toast.info(`🚀 Buddy Connect ${newV} is here!`);
            return newV;
          });
        }
        if (row.key === "announcement") {
          const msg = String(row.value).replace(/"/g, "");
          setAnnouncement(msg);
          if (msg) toast.info(`📢 ${msg}`, { duration: 8000 });
        }
      })
      .subscribe();

    return () => { mounted = false; supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isEnabled = (key: string) => flags[key]?.enabled ?? true;

  return (
    <FeatureFlagsContext.Provider value={{ flags, version, announcement, isEnabled, loading }}>
      {children}
    </FeatureFlagsContext.Provider>
  );
};