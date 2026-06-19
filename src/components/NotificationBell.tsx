import { Bell, Heart, MessageCircle, UserPlus, Coins, Eye } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const typeIcons: Record<string, typeof Heart> = {
  like: Heart,
  comment: MessageCircle,
  follow: UserPlus,
  coin_tip: Coins,
  story_view: Eye,
};

const NotificationBell = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);
  const [latestType, setLatestType] = useState<string | null>(null);
  const [showType, setShowType] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("type")
      .eq("user_id", user.id)
      .eq("is_read", false)
      .order("created_at", { ascending: false });
    setUnread(data?.length || 0);
    if (data && data.length > 0) {
      setLatestType(data[0].type);
      setShowType(true);
      setTimeout(() => setShowType(false), 3000);
    } else {
      setLatestType(null);
    }
  };

  useEffect(() => {
    if (!user) return;
    load();
    const ch = supabase
      .channel("bell-notifs")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => load())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const TypeIcon = latestType ? typeIcons[latestType] || Bell : null;

  return (
    <button onClick={() => navigate("/notifications")} className="relative text-foreground">
      <Bell className="size-5" />
      {unread > 0 && (
        <span className="absolute -top-2 -right-2 min-w-[16px] h-4 px-1 rounded-full gold-gradient flex items-center justify-center text-[9px] font-bold text-primary-foreground shadow-md">
          {showType && TypeIcon ? <TypeIcon className="size-2.5" /> : (unread > 99 ? "99+" : unread)}
        </span>
      )}
    </button>
  );
};

export default NotificationBell;