import { useLocation, useNavigate } from "react-router-dom";
import { Home, Film, PlusCircle, MessageCircle, User } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const navItems = [
  { icon: Home, label: "Feed", path: "/" },
  { icon: Film, label: "Reels", path: "/reels" },
  { icon: PlusCircle, label: "Create", path: "/create" },
  { icon: MessageCircle, label: "Chat", path: "/chat" },
  { icon: User, label: "Profile", path: "/profile" },
];

const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [unreadMsgs, setUnreadMsgs] = useState(0);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("receiver_id", user.id)
        .eq("is_read", false);
      setUnreadMsgs(count || 0);
    };
    load();
    const ch = supabase
      .channel("nav-msg")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `receiver_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 safe-area-bottom">
      <div className="mx-3 mb-3">
        <div className="glass rounded-2xl px-2 py-2 flex items-center justify-around gold-glow">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const isCreate = item.label === "Create";

            if (isCreate) {
              return (
                <button
                  key={item.label}
                  onClick={() => navigate(item.path)}
                  className="flex items-center justify-center -mt-6 size-14 rounded-full gold-gradient shadow-lg shadow-primary/30 text-primary-foreground"
                >
                  <PlusCircle className="size-7" />
                </button>
              );
            }

            return (
              <button
                key={item.label}
                onClick={() => navigate(item.path)}
                className={`relative flex flex-col items-center gap-1 px-3 py-1 transition-colors ${
                  isActive ? "text-gold" : "text-muted-foreground"
                }`}
              >
                <item.icon className="size-5" />
                {item.label === "Chat" && unreadMsgs > 0 && (
                  <span className="absolute -top-1 right-1 min-w-[16px] h-4 px-1 rounded-full gold-gradient flex items-center justify-center text-[9px] font-bold text-primary-foreground">
                    {unreadMsgs > 99 ? "99+" : unreadMsgs}
                  </span>
                )}
                <span className="text-[10px] uppercase tracking-widest font-medium">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

export default BottomNav;
