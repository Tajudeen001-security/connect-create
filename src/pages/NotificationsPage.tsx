import { useState, useEffect } from "react";
import { ArrowLeft, Heart, MessageCircle, UserPlus, Coins, Bell, Lock, Eye, UserCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import BottomNav from "@/components/BottomNav";
import NotificationPrompt from "@/components/NotificationPrompt";

interface Notification {
  id: string;
  type: string;
  content: string;
  is_read: boolean;
  created_at: string;
  from_user_id: string | null;
  related_post_id?: string | null;
}

const typeIcons: Record<string, typeof Heart> = {
  like: Heart,
  comment: MessageCircle,
  follow: UserPlus,
  coin_tip: Coins,
  unlock: Lock,
  story_view: Eye,
  new_user: UserCheck,
  general: Bell,
};

const typeColors: Record<string, string> = {
  like: "text-red-400",
  comment: "text-blue-400",
  follow: "text-gold",
  coin_tip: "text-gold",
  unlock: "text-gold",
  story_view: "text-muted-foreground",
  new_user: "text-blue-400",
  general: "text-muted-foreground",
};

const NotificationsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [actors, setActors] = useState<Record<string, { username: string; avatar_url: string | null }>>({});

  useEffect(() => {
    if (!user) return;
    fetchNotifications();

    // Real-time subscription
    const channel = supabase
      .channel("notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          setNotifications((prev) => [payload.new as Notification, ...prev]);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const fetchNotifications = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (!data) return;
    setNotifications(data);
    const ids = [...new Set(data.map(n => n.from_user_id).filter(Boolean) as string[])];
    if (ids.length === 0) return;
    const { data: profiles } = await supabase.from("profiles").select("user_id, username, avatar_url").in("user_id", ids);
    const map: Record<string, { username: string; avatar_url: string | null }> = {};
    profiles?.forEach(p => { map[p.user_id] = { username: p.username || "user", avatar_url: p.avatar_url }; });
    setActors(map);
  };
  const openNotification = async (n: Notification) => {
    if (!n.is_read) {
      await supabase.from("notifications").update({ is_read: true }).eq("id", n.id);
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x));
    }
    if (n.related_post_id) {
      navigate(`/post/${n.related_post_id}`);
    } else if (n.type === "follow" && n.from_user_id) {
      navigate(`/user/${n.from_user_id}`);
    } else if (n.from_user_id) {
      navigate(`/user/${n.from_user_id}`);
    }
  };

  const markAllRead = async () => {
    if (!user) return;
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  };

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 pb-24">
        <Bell className="size-16 text-gold mb-4" />
        <p className="text-sm text-muted-foreground text-center mb-6">Sign in to see your notifications</p>
        <button onClick={() => navigate("/auth")} className="px-8 py-3 rounded-xl gold-gradient text-primary-foreground text-sm font-bold uppercase tracking-widest">
          Sign In
        </button>
        <BottomNav />
      </div>
    );
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/30">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="text-foreground">
              <ArrowLeft className="size-5" />
            </button>
            <h1 className="font-display italic text-xl text-gold">Notifications</h1>
          </div>
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="text-xs text-gold font-semibold">
              Mark all read
            </button>
          )}
        </div>
      </header>

      <div className="px-3 pt-2">
        <NotificationPrompt compact />
      </div>

      {notifications.length === 0 ? (

        <div className="flex flex-col items-center justify-center py-20">
          <Bell className="size-12 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">No notifications yet</p>
        </div>
      ) : (
        <div className="divide-y divide-border/20">
          {notifications.map((notif) => {
            const Icon = typeIcons[notif.type] || Bell;
            const color = typeColors[notif.type] || "text-muted-foreground";
            const actor = notif.from_user_id ? actors[notif.from_user_id] : undefined;
            return (
              <button
                key={notif.id}
                onClick={() => openNotification(notif)}
                className={`w-full text-left flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface/40 ${
                  !notif.is_read ? "bg-primary/5" : ""
                }`}
              >
                <div className="relative shrink-0">
                  {actor?.avatar_url ? (
                    <img src={actor.avatar_url} alt={actor.username} className="size-9 rounded-full object-cover border border-gold/20" />
                  ) : (
                    <div className="size-9 rounded-full bg-surface flex items-center justify-center text-xs text-gold font-bold">
                      {(actor?.username?.[0] || "?").toUpperCase()}
                    </div>
                  )}
                  <div className={`absolute -bottom-1 -right-1 size-5 rounded-full bg-background border border-border flex items-center justify-center ${color}`}>
                    <Icon className="size-3" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">
                    {actor && <span className="font-semibold text-champagne">@{actor.username} </span>}
                    {notif.content}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {timeAgo(notif.created_at)}
                  </p>
                </div>
                {!notif.is_read && (
                  <div className="mt-2 size-2 rounded-full gold-gradient shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}

      <BottomNav />
    </div>
  );
};

export default NotificationsPage;
