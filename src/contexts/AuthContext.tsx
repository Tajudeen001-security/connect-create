import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Update user presence
  useEffect(() => {
    if (!user) return;

    const updatePresence = (online: boolean) => {
      supabase.from("user_presence").upsert(
        { user_id: user.id, is_online: online, last_seen: new Date().toISOString(), is_typing: false },
        { onConflict: "user_id" }
      );
    };

    updatePresence(true);
    const interval = setInterval(() => updatePresence(true), 60000);

    // Silent IP-based location capture (no GPS prompt). Fire-and-forget.
    supabase.functions.invoke("track-presence").catch(() => {});

    const handleVisibility = () => updatePresence(!document.hidden);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", () => updatePresence(false));

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
      updatePresence(false);
    };
  }, [user]);

  const signOut = async () => {
    if (user) {
      await supabase.from("user_presence").upsert(
        { user_id: user.id, is_online: false, last_seen: new Date().toISOString(), is_typing: false },
        { onConflict: "user_id" }
      );
    }
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
