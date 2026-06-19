import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Full-screen cinematic overlay shown right after a successful sign-in.
 * Triggered by a `welcome-back` CustomEvent dispatched from AuthPage so it
 * doesn't fire on every silent token refresh from onAuthStateChange.
 */
const WelcomeBackOverlay = () => {
  const { user } = useAuth();
  const [name, setName] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [phase, setPhase] = useState<"in" | "out">("in");

  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      let displayName: string | null = detail.name || null;
      let avatarUrl: string | null = detail.avatar || null;

      // Resolve from profiles if not provided
      if (!displayName || !avatarUrl) {
        const { data: { user: u } } = await supabase.auth.getUser();
        if (u) {
          const { data } = await supabase
            .from("profiles")
            .select("display_name, username, avatar_url")
            .eq("user_id", u.id)
            .maybeSingle();
          if (data) {
            displayName = displayName || data.display_name || data.username || "Buddy";
            avatarUrl = avatarUrl || data.avatar_url || null;
          }
        }
      }
      setName(displayName || "Buddy");
      setAvatar(avatarUrl);
      setPhase("in");
      setShow(true);
      // Hold ~1.8s, fade ~0.4s
      setTimeout(() => setPhase("out"), 1800);
      setTimeout(() => setShow(false), 2200);
    };
    window.addEventListener("welcome-back", handler as EventListener);
    return () => window.removeEventListener("welcome-back", handler as EventListener);
  }, [user]);

  if (!show) return null;

  const initial = (name || "B")[0].toUpperCase();

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none ${
        phase === "in" ? "animate-fade-in" : "animate-fade-out"
      }`}
      style={{
        background:
          "radial-gradient(circle at 50% 45%, rgba(212,175,55,0.18) 0%, rgba(10,8,6,0.96) 55%, rgba(0,0,0,0.99) 100%)",
        backdropFilter: "blur(18px)",
      }}
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-5 px-8 text-center animate-scale-in">
        {/* Avatar in dual gold ring */}
        <div className="relative">
          <div className="absolute inset-0 rounded-full blur-2xl bg-gold/30 animate-pulse" />
          <div className="relative size-28 rounded-full p-[3px] gold-gradient">
            <div className="w-full h-full rounded-full bg-background p-[2px]">
              {avatar ? (
                <img
                  src={avatar}
                  alt={name || ""}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <div className="w-full h-full rounded-full bg-surface flex items-center justify-center font-display italic text-4xl text-gold">
                  {initial}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-[0.4em] text-gold/80">
            JagX Buddy Connect
          </p>
          <h2 className="font-display italic text-3xl text-champagne">
            Welcome back,
          </h2>
          <h1 className="font-display italic text-4xl text-gold drop-shadow-[0_0_24px_rgba(212,175,55,0.45)]">
            {name}
          </h1>
        </div>

        {/* Animated gold sweep underline */}
        <div className="relative h-[2px] w-40 overflow-hidden rounded-full bg-gold/10">
          <div
            className="absolute inset-y-0 left-0 w-1/2 gold-gradient rounded-full"
            style={{ animation: "welcome-sweep 1.6s ease-in-out forwards" }}
          />
        </div>

        <p className="text-[11px] text-muted-foreground tracking-widest uppercase">
          🐆 Let's make today legendary
        </p>
      </div>

      <style>{`
        @keyframes welcome-sweep {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  );
};

export default WelcomeBackOverlay;