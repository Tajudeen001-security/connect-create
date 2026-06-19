import { Settings, Grid3X3, Film, Bookmark, Users, BadgeCheck, LogOut, Coins, Edit, TrendingUp, Megaphone, MapPin, Shield, Pin, X, Play } from "lucide-react";
import { useNavigate } from "react-router-dom";
import BottomNav from "@/components/BottomNav";
import Canonical from "@/components/Canonical";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const ProfilePage = () => {
  const [activeTab, setActiveTab] = useState<"posts" | "reels" | "saved">("posts");
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [favorites, setFavorites] = useState<any[]>([]);
  const [viewingPost, setViewingPost] = useState<any | null>(null);
  const [pinMenuFor, setPinMenuFor] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("user_id", user.id).single().then(({ data }) => { if (data) setProfile(data); });
    loadPosts();
    supabase.from("followers").select("id", { count: "exact" }).eq("following_id", user.id).then(({ count }) => setFollowerCount(count || 0));
    supabase.from("followers").select("id", { count: "exact" }).eq("follower_id", user.id).then(({ count }) => setFollowingCount(count || 0));
    supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle().then(({ data }) => setIsAdmin(!!data));
  }, [user]);

  const loadPosts = async () => {
    if (!user) return;
    const { data } = await supabase.from("posts").select("*").eq("user_id", user.id);
    if (!data) return;
    const sorted = [...data].sort((a, b) => {
      if (a.pinned_at && !b.pinned_at) return -1;
      if (!a.pinned_at && b.pinned_at) return 1;
      if (a.pinned_at && b.pinned_at) return new Date(b.pinned_at).getTime() - new Date(a.pinned_at).getTime();
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    setPosts(sorted);
  };

  useEffect(() => {
    if (activeTab !== "saved" || !user) return;
    (async () => {
      const { data: favs } = await supabase.from("favorites").select("post_id").eq("user_id", user.id).order("created_at", { ascending: false });
      const ids = (favs || []).map((f: any) => f.post_id);
      if (ids.length === 0) { setFavorites([]); return; }
      const { data: favPosts } = await supabase.from("posts").select("*").in("id", ids);
      setFavorites(favPosts || []);
    })();
  }, [activeTab, user]);

  const togglePin = async (postId: string, currentlyPinned: boolean) => {
    setPinMenuFor(null);
    await supabase.from("posts").update({ pinned_at: currentlyPinned ? null : new Date().toISOString() }).eq("id", postId);
    toast.success(currentlyPinned ? "Unpinned" : "Pinned to profile 📌");
    loadPosts();
  };

  const displayPosts = activeTab === "saved" ? favorites : activeTab === "reels" ? posts.filter(p => p.video_url) : posts;

  return (
    <div className="min-h-screen pb-24">
      <Canonical path={profile?.user_id ? `/user/${profile.user_id}` : "/profile"} />
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/30">
        <div className="flex items-center justify-between px-4 h-14">
          <h1 className="text-sm font-semibold text-champagne">
            @{profile?.username || user?.user_metadata?.username || user?.email?.split("@")[0] || "user"}
          </h1>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/earnings")} className="text-gold"><TrendingUp className="size-5" /></button>
            <button onClick={() => navigate("/coins")} className="text-gold"><Coins className="size-5" /></button>
            <button onClick={signOut} className="text-muted-foreground"><LogOut className="size-5" /></button>
          </div>
        </div>
      </header>

      {profile?.banner_url && (
        <div className="h-28 overflow-hidden"><img src={profile.banner_url} className="w-full h-full object-cover" /></div>
      )}

      <div className="px-4 pt-6 pb-4">
        <div className="flex items-start gap-6">
          <div className={`size-20 rounded-full ${profile?.banner_url ? "-mt-10 relative z-10 border-4 border-background" : "story-ring p-[2px]"} shrink-0 overflow-hidden`}>
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} className="w-full h-full rounded-full object-cover" />
            ) : (
              <div className="w-full h-full rounded-full bg-surface flex items-center justify-center text-2xl font-display italic text-gold">
                {(profile?.username || user?.user_metadata?.username || user?.email || "U")[0].toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-semibold text-champagne">
                {profile?.display_name || user?.user_metadata?.display_name || user?.email?.split("@")[0] || "User"}
              </h2>
              {profile?.is_verified && <BadgeCheck className="size-4 text-gold" />}
            </div>
            {profile?.bio && <p className="text-xs text-muted-foreground mb-1">{profile.bio}</p>}
            {profile?.location && (
              <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1"><MapPin className="size-3" /> {profile.location}</p>
            )}
            {!profile?.bio && <p className="text-xs text-muted-foreground mb-3">New to JagX Buddy Connect ✨</p>}
            <div className="flex gap-6">
              <div className="text-center"><p className="text-sm font-bold text-champagne">{posts.length}</p><p className="text-[10px] text-muted-foreground">Posts</p></div>
              <div className="text-center"><p className="text-sm font-bold text-champagne">{followerCount}</p><p className="text-[10px] text-muted-foreground">Followers</p></div>
              <div className="text-center"><p className="text-sm font-bold text-champagne">{followingCount}</p><p className="text-[10px] text-muted-foreground">Following</p></div>
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={() => navigate("/edit-profile")} className="flex-1 py-2 rounded-lg gold-gradient text-primary-foreground text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2">
            <Edit className="size-3.5" /> Edit Profile
          </button>
          <button onClick={() => navigate("/ads")} className="py-2 px-3 rounded-lg bg-surface border border-border"><Megaphone className="size-4 text-gold" /></button>
          <button className="py-2 px-3 rounded-lg bg-surface border border-border"><Users className="size-4 text-foreground" /></button>
        </div>

        <button onClick={() => navigate("/coins")} className="w-full mt-4 p-3 rounded-xl glass gold-glow text-left">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">JagX Coins</p>
              <p className="text-lg font-bold text-gold">{profile?.jagx_coins || 0}</p>
            </div>
            <span className="px-4 py-2 rounded-lg gold-gradient text-primary-foreground text-[10px] font-bold uppercase tracking-widest">Buy Coins</span>
          </div>
        </button>

        {/* Earnings quick view */}
        <button onClick={() => navigate("/earnings")} className="w-full mt-3 p-3 rounded-xl bg-surface border border-border/30 flex items-center justify-between">
          <div className="flex items-center gap-2"><TrendingUp className="size-5 text-green-400" /><span className="text-sm text-foreground">View Earnings</span></div>
          <span className="text-xs text-gold font-semibold">→</span>
        </button>

        {/* Admin Panel */}
        {isAdmin && (
          <button onClick={() => navigate("/admin")} className="w-full mt-3 p-3 rounded-xl bg-surface border border-border/30 flex items-center justify-between">
            <div className="flex items-center gap-2"><Shield className="size-5 text-gold" /><span className="text-sm text-foreground">Admin Panel</span></div>
            <span className="text-xs text-gold font-semibold">→</span>
          </button>
        )}

        {!profile?.is_verified && (
          <button onClick={() => navigate("/coins")} className="w-full mt-3 p-3 rounded-xl bg-surface border border-border flex items-center justify-between">
            <div className="flex items-center gap-2"><BadgeCheck className="size-5 text-gold" /><span className="text-sm text-foreground">Get Verified</span></div>
            <span className="text-xs text-gold font-semibold">₦10,000</span>
          </button>
        )}

        <button onClick={() => navigate("/privacy")} className="w-full mt-3 p-3 rounded-xl bg-surface border border-border/30 flex items-center justify-between">
          <div className="flex items-center gap-2"><Shield className="size-5 text-muted-foreground" /><span className="text-sm text-foreground">Privacy &amp; Terms</span></div>
          <span className="text-xs text-muted-foreground">→</span>
        </button>
      </div>

      <div className="flex border-b border-border/30">
        {[{ key: "posts" as const, icon: Grid3X3 }, { key: "reels" as const, icon: Film }, { key: "saved" as const, icon: Bookmark }].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-3 flex justify-center border-b-2 transition-colors ${activeTab === tab.key ? "border-primary text-gold" : "border-transparent text-muted-foreground"}`}>
            <tab.icon className="size-5" />
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-[2px]">
        {displayPosts.map(post => (
          <div key={post.id} className="relative aspect-square bg-surface overflow-hidden">
            <button onClick={() => setViewingPost(post)} className="block w-full h-full">
              {post.image_url ? <img src={post.image_url} className="w-full h-full object-cover" loading="lazy" /> :
                post.video_url ? (
                  <div className="relative w-full h-full">
                    <video src={post.video_url} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20"><Play className="size-6 text-white fill-white" /></div>
                  </div>
                ) :
                <div className="w-full h-full flex items-center justify-center p-2"><p className="text-xs text-muted-foreground text-center line-clamp-3">{post.content}</p></div>}
            </button>
            {post.pinned_at && activeTab !== "saved" && (
              <div className="absolute top-1 left-1 size-5 rounded-full bg-black/70 flex items-center justify-center pointer-events-none">
                <Pin className="size-3 text-gold fill-gold" />
              </div>
            )}
            {activeTab !== "saved" && (
              <button onClick={(e) => { e.stopPropagation(); setPinMenuFor(pinMenuFor === post.id ? null : post.id); }}
                className="absolute top-1 right-1 size-6 rounded-full bg-black/60 flex items-center justify-center">
                <Pin className="size-3 text-white" />
              </button>
            )}
            {pinMenuFor === post.id && (
              <div className="absolute top-8 right-1 z-10 bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
                <button onClick={() => togglePin(post.id, !!post.pinned_at)} className="block px-3 py-1.5 text-xs text-foreground hover:bg-surface whitespace-nowrap">
                  {post.pinned_at ? "Unpin" : "Pin to profile"}
                </button>
              </div>
            )}
          </div>
        ))}
        {displayPosts.length === 0 && (
          <div className="col-span-3 py-16 text-center"><p className="text-sm text-muted-foreground">No posts yet. Create your first post!</p></div>
        )}
      </div>

      {viewingPost && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl flex flex-col" onClick={() => setViewingPost(null)}>
          <div className="flex items-center justify-between px-4 h-14 border-b border-border/30">
            <span className="text-sm font-semibold text-champagne">Post</span>
            <button onClick={() => setViewingPost(null)}><X className="size-5 text-foreground" /></button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
            {viewingPost.video_url ? (
              <video src={viewingPost.video_url} className="max-w-full max-h-full rounded-xl" controls autoPlay loop playsInline />
            ) : viewingPost.image_url ? (
              <img src={viewingPost.image_url} className="max-w-full max-h-full rounded-xl object-contain" />
            ) : (
              <p className="text-foreground text-center px-4">{viewingPost.content}</p>
            )}
          </div>
          {viewingPost.content && (viewingPost.video_url || viewingPost.image_url) && (
            <div className="px-4 py-3 border-t border-border/30">
              <p className="text-sm text-foreground/90">{viewingPost.content}</p>
            </div>
          )}
        </div>
      )}

      <BottomNav />
    </div>
  );
};

export default ProfilePage;
