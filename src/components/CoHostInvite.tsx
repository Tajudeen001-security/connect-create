import { useEffect, useState } from "react";
import { X, UserPlus, BadgeCheck, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  liveStreamId: string;
  hostId: string;
  onClose: () => void;
}

const CoHostInvite = ({ liveStreamId, hostId, onClose }: Props) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);

  useEffect(() => {
    loadInvites();
    const ch = supabase.channel(`co-hosts-${liveStreamId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_co_hosts", filter: `live_stream_id=eq.${liveStreamId}` }, loadInvites)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveStreamId]);

  const loadInvites = async () => {
    const { data } = await supabase.from("live_co_hosts").select("*").eq("live_stream_id", liveStreamId);
    if (!data) return;
    const ids = data.map(i => i.co_host_id);
    if (ids.length === 0) { setInvites([]); return; }
    const { data: profiles } = await supabase.from("profiles").select("user_id, username, avatar_url, is_verified").in("user_id", ids);
    const map = new Map(profiles?.map(p => [p.user_id, p]) || []);
    setInvites(data.map(i => ({ ...i, profile: map.get(i.co_host_id) })));
  };

  const search = async (q: string) => {
    setQuery(q);
    if (q.trim().length < 2) { setResults([]); return; }
    const { data } = await supabase
      .from("profiles")
      .select("user_id, username, display_name, avatar_url, is_verified")
      .eq("is_verified", true)
      .neq("user_id", hostId)
      .ilike("username", `%${q.trim()}%`)
      .limit(10);
    setResults(data || []);
  };

  const invite = async (coHostId: string) => {
    const { error } = await supabase.from("live_co_hosts").insert({
      live_stream_id: liveStreamId, host_id: hostId, co_host_id: coHostId,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Invite sent!");
    setQuery(""); setResults([]);
  };

  const remove = async (id: string) => {
    await supabase.from("live_co_hosts").delete().eq("id", id);
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl flex items-end sm:items-center justify-center">
      <div className="w-full sm:max-w-md bg-surface rounded-t-2xl sm:rounded-2xl border border-border/30 p-5 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-champagne flex items-center gap-2"><UserPlus className="size-4 text-gold" /> Invite Co-Host</h3>
          <button onClick={onClose}><X className="size-5 text-foreground" /></button>
        </div>
        <p className="text-[10px] text-muted-foreground mb-3">Only verified broadcasters can co-host.</p>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input value={query} onChange={e => search(e.target.value)} placeholder="Search verified users..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground outline-none" />
        </div>
        <div className="flex-1 overflow-y-auto space-y-2">
          {results.map(r => (
            <button key={r.user_id} onClick={() => invite(r.user_id)} className="w-full p-2.5 rounded-xl bg-background border border-border/30 flex items-center gap-3 text-left hover:border-gold/40">
              <img src={r.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${r.username}`} className="size-9 rounded-full" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate flex items-center gap-1">{r.display_name || r.username} <BadgeCheck className="size-3.5 text-gold" /></p>
                <p className="text-xs text-muted-foreground truncate">@{r.username}</p>
              </div>
              <span className="text-[10px] font-bold uppercase text-gold">Invite</span>
            </button>
          ))}
          {invites.length > 0 && (
            <div className="pt-2">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Pending / Active</p>
              {invites.map(i => (
                <div key={i.id} className="p-2.5 rounded-xl bg-background border border-border/30 flex items-center gap-3 mb-2">
                  <img src={i.profile?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${i.profile?.username}`} className="size-9 rounded-full" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">@{i.profile?.username || "user"}</p>
                    <p className="text-[10px] uppercase text-muted-foreground">{i.status}</p>
                  </div>
                  <button onClick={() => remove(i.id)} className="text-[10px] font-bold uppercase text-destructive">Cancel</button>
                </div>
              ))}
            </div>
          )}
          {results.length === 0 && invites.length === 0 && (
            <p className="text-center text-xs text-muted-foreground py-8">Search above to invite a verified co-host.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default CoHostInvite;