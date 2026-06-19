import { useEffect, useState } from "react";
import { ArrowLeft, Users, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import Canonical from "@/components/Canonical";

const GroupDiscoverPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [groups, setGroups] = useState<any[]>([]);
  const [memberOf, setMemberOf] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");

  useEffect(() => {
    supabase.from("group_chats").select("*").eq("is_public", true).order("created_at", { ascending: false }).limit(100)
      .then(({ data }) => setGroups(data || []));
    if (user) {
      supabase.from("group_members").select("group_id").eq("user_id", user.id)
        .then(({ data }) => setMemberOf(new Set((data || []).map(d => d.group_id))));
    }
  }, [user]);

  const join = async (g: any) => {
    if (!user) { navigate("/auth"); return; }
    const { error } = await supabase.from("group_members").insert({ group_id: g.id, user_id: user.id, role: "member" });
    if (error) { toast.error(error.message); return; }
    toast.success(`Joined ${g.name}`);
    navigate(`/group/${g.id}`);
  };

  const copyLink = async (code: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}/g/${code}`);
    toast.success("Invite link copied");
  };

  const filtered = groups.filter(g => g.name.toLowerCase().includes(q.toLowerCase()) || (g.description || "").toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="min-h-screen pb-24 bg-background">
      <Canonical path="/groups" />
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/30">
        <div className="flex items-center gap-3 px-4 h-14">
          <button onClick={() => navigate(-1)}><ArrowLeft className="size-5 text-foreground" /></button>
          <h1 className="font-display italic text-xl text-gold">Discover Groups</h1>
        </div>
      </header>
      <div className="px-4 py-3">
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-surface border border-border/30">
          <Search className="size-4 text-muted-foreground" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search public groups..." className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none flex-1" />
        </div>
      </div>
      <div className="px-4 space-y-2">
        {filtered.length === 0 && <p className="text-center text-sm text-muted-foreground py-12">No public groups yet. Be the first to create one!</p>}
        {filtered.map(g => (
          <article key={g.id} className="p-4 rounded-xl bg-surface border border-border/30">
            <div className="flex items-start gap-3">
              <div className="size-12 rounded-full gold-gradient flex items-center justify-center shrink-0"><Users className="size-5 text-primary-foreground" /></div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold text-champagne">{g.name}</h2>
                {g.description && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{g.description}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3">
              {memberOf.has(g.id) ? (
                <button onClick={() => navigate(`/group/${g.id}`)} className="flex-1 py-2 rounded-lg bg-surface-elevated border border-gold/30 text-xs font-bold text-gold">Open</button>
              ) : (
                <button onClick={() => join(g)} className="flex-1 py-2 rounded-lg gold-gradient text-primary-foreground text-xs font-bold uppercase tracking-widest">Join</button>
              )}
              <button onClick={() => copyLink(g.invite_code)} className="px-3 py-2 rounded-lg bg-surface-elevated border border-border/30 text-xs text-foreground">Copy link</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};

export default GroupDiscoverPage;