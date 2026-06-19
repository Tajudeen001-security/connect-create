import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { UserPlus, X } from "lucide-react";

/**
 * Listens for co-host invites targeting the current user and shows a toast/banner.
 * Accepting marks the invite "accepted" and navigates to /live so they join the
 * stream's LiveKit room with publish privileges (token issued by livekit-token).
 */
const CoHostNotice = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<any | null>(null);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`my-co-host-invites-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_co_hosts", filter: `co_host_id=eq.${user.id}` },
        (payload) => setInvite(payload.new),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  if (!invite) return null;

  const accept = async () => {
    await supabase.from("live_co_hosts").update({ status: "accepted" }).eq("id", invite.id);
    setInvite(null);
    navigate("/live");
  };
  const decline = async () => {
    await supabase.from("live_co_hosts").update({ status: "declined" }).eq("id", invite.id);
    setInvite(null);
  };

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] w-[92%] max-w-md p-3 rounded-2xl bg-surface border border-gold/40 shadow-xl flex items-center gap-3">
      <div className="size-9 rounded-full gold-gradient flex items-center justify-center text-primary-foreground"><UserPlus className="size-4" /></div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-champagne">Co-host invite</p>
        <p className="text-[10px] text-muted-foreground truncate">You've been invited to join a live stream.</p>
      </div>
      <button onClick={accept} className="px-3 py-1.5 rounded-lg gold-gradient text-primary-foreground text-[10px] font-bold uppercase">Join</button>
      <button onClick={decline}><X className="size-4 text-muted-foreground" /></button>
    </div>
  );
};

export default CoHostNotice;