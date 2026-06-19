import { MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const MessageIconBadge = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);

  const load = async () => {
    if (!user) return;
    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("receiver_id", user.id)
      .eq("is_read", false);
    setUnread(count || 0);
    if (typeof document !== "undefined") {
      const base = "JagX Connect";
      document.title = (count && count > 0) ? `(${count}) ${base}` : base;
    }
  };

  useEffect(() => {
    if (!user) return;
    load();
    const ch = supabase
      .channel("msg-badge")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `receiver_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <button onClick={() => navigate("/chat")} className="relative text-foreground">
      <MessageCircle className="size-5" />
      {unread > 0 && (
        <span className="absolute -top-2 -right-2 min-w-[16px] h-4 px-1 rounded-full gold-gradient flex items-center justify-center text-[9px] font-bold text-primary-foreground shadow-md">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );
};

export default MessageIconBadge;