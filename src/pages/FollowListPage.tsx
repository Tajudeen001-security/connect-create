import { useEffect, useState } from "react";
import { ArrowLeft, BadgeCheck } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type Mode = "followers" | "following";

const FollowListPage = ({ mode }: { mode: Mode }) => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [people, setPeople] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const col = mode === "followers" ? "following_id" : "follower_id";
      const peerCol = mode === "followers" ? "follower_id" : "following_id";
      const { data: links } = await supabase.from("followers").select(`${peerCol}`).eq(col, userId);
      const ids = (links || []).map((r: any) => r[peerCol]);
      if (ids.length === 0) { setPeople([]); setLoading(false); return; }
      const { data: profs } = await supabase.from("profiles")
        .select("user_id, username, display_name, avatar_url, is_verified, bio").in("user_id", ids);
      setPeople(profs || []);
      if (user) {
        const { data: mine } = await supabase.from("followers").select("following_id").eq("follower_id", user.id);
        setFollowingIds(new Set((mine || []).map((r: any) => r.following_id)));
      }
      setLoading(false);
    })();
  }, [userId, mode, user]);

  const toggleFollow = async (peerId: string) => {
    if (!user) return;
    if (followingIds.has(peerId)) {
      await supabase.from("followers").delete().eq("follower_id", user.id).eq("following_id", peerId);
      setFollowingIds(prev => { const n = new Set(prev); n.delete(peerId); return n; });
    } else {
      await supabase.from("followers").insert({ follower_id: user.id, following_id: peerId });
      setFollowingIds(prev => new Set(prev).add(peerId));
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/30">
        <div className="flex items-center gap-3 px-4 h-14">
          <button onClick={() => navigate(-1)} className="text-foreground"><ArrowLeft className="size-5" /></button>
          <h1 className="text-sm font-semibold text-champagne capitalize">{mode}</h1>
        </div>
      </header>
      {loading ? (
        <div className="flex justify-center pt-16"><div className="size-8 rounded-full border-2 border-gold border-t-transparent animate-spin" /></div>
      ) : people.length === 0 ? (
        <p className="text-center text-muted-foreground text-sm pt-16">No {mode} yet</p>
      ) : (
        <div className="divide-y divide-border/30">
          {people.map(p => (
            <div key={p.user_id} className="flex items-center gap-3 px-4 py-3">
              <button onClick={() => navigate(`/user/${p.user_id}`)} className="flex items-center gap-3 flex-1 min-w-0">
                <div className="size-11 rounded-full bg-surface overflow-hidden shrink-0">
                  {p.avatar_url ? <img src={p.avatar_url} className="w-full h-full object-cover" /> :
                    <div className="w-full h-full flex items-center justify-center text-gold font-display italic">{(p.username||"U")[0].toUpperCase()}</div>}
                </div>
                <div className="min-w-0 text-left">
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-semibold text-champagne truncate">@{p.username}</span>
                    {p.is_verified && <BadgeCheck className="size-3.5 text-gold shrink-0" />}
                  </div>
                  {p.display_name && <p className="text-[11px] text-muted-foreground truncate">{p.display_name}</p>}
                </div>
              </button>
              {user && user.id !== p.user_id && (
                <button onClick={() => toggleFollow(p.user_id)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest ${followingIds.has(p.user_id) ? "bg-surface border border-border text-foreground" : "gold-gradient text-primary-foreground"}`}>
                  {followingIds.has(p.user_id) ? "Following" : "Follow"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FollowListPage;