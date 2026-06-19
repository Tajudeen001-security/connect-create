import { useState, useEffect } from "react";
import { ArrowLeft, MessageCircle, UserPlus, UserMinus, BadgeCheck, MoreVertical, Pin, Play, X } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";
import Canonical from "@/components/Canonical";

const UserProfilePage = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [postCount, setPostCount] = useState(0);
  const [posts, setPosts] = useState<any[]>([]);
  const [viewingPost, setViewingPost] = useState<any | null>(null);

  useEffect(() => {
    if (!userId) return;
    supabase.from("profiles").select("*").eq("user_id", userId).single().then(({ data }) => { if (data) setProfile(data); });
    supabase.from("followers").select("id", { count: "exact" }).eq("following_id", userId).then(({ count }) => setFollowerCount(count || 0));
    supabase.from("followers").select("id", { count: "exact" }).eq("follower_id", userId).then(({ count }) => setFollowingCount(count || 0));
    supabase.from("posts").select("*").eq("user_id", userId).then(({ data }) => {
      if (!data) return;
      const sorted = [...data].sort((a, b) => {
        if (a.pinned_at && !b.pinned_at) return -1;
        if (!a.pinned_at && b.pinned_at) return 1;
        if (a.pinned_at && b.pinned_at) return new Date(b.pinned_at).getTime() - new Date(a.pinned_at).getTime();
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      setPosts(sorted); setPostCount(sorted.length);
    });
    if (user) {
      supabase.from("followers").select("id").eq("follower_id", user.id).eq("following_id", userId).then(({ data }) => setIsFollowing((data?.length || 0) > 0));
    }
  }, [userId, user]);

  const toggleFollow = async () => {
    if (!user || !userId) return;
    if (isFollowing) {
      await supabase.from("followers").delete().eq("follower_id", user.id).eq("following_id", userId);
      setIsFollowing(false);
      setFollowerCount(p => p - 1);
    } else {
      await supabase.from("followers").insert({ follower_id: user.id, following_id: userId });
      setIsFollowing(true);
      setFollowerCount(p => p + 1);
      // Send notification
      await supabase.from("notifications").insert({ user_id: userId, from_user_id: user.id, type: "follow", content: `started following you` });
    }
  };

  if (!profile) return <div className="min-h-screen flex items-center justify-center bg-background"><div className="size-8 rounded-full border-2 border-gold border-t-transparent animate-spin" /></div>;

  return (
    <div className="min-h-screen pb-24 bg-background">
      <Canonical path={`/user/${profile.user_id || ""}`} />
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/30">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="text-foreground"><ArrowLeft className="size-5" /></button>
            <span className="text-sm font-semibold text-champagne">@{profile.username || "user"}</span>
          </div>
        </div>
      </header>

      <div className="px-4 pt-6 pb-4">
        <div className="flex items-start gap-6">
          <div className="size-20 rounded-full border-2 border-gold/30 p-[2px] shrink-0 overflow-hidden">
            {profile.avatar_url ? <img src={profile.avatar_url} className="w-full h-full rounded-full object-cover" /> :
              <div className="w-full h-full rounded-full bg-surface flex items-center justify-center text-2xl font-display italic text-gold">
                {(profile.username || "U")[0].toUpperCase()}
              </div>}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-semibold text-champagne">{profile.display_name || profile.username || "User"}</h2>
              {profile.is_verified && <BadgeCheck className="size-4 text-gold" />}
            </div>
            {profile.bio && <p className="text-xs text-muted-foreground mb-3">{profile.bio}</p>}
            <div className="flex gap-6">
              <div className="text-center"><p className="text-sm font-bold text-champagne">{postCount}</p><p className="text-[10px] text-muted-foreground">Posts</p></div>
              <button onClick={() => navigate(`/user/${userId}/followers`)} className="text-center"><p className="text-sm font-bold text-champagne">{followerCount}</p><p className="text-[10px] text-muted-foreground">Followers</p></button>
              <button onClick={() => navigate(`/user/${userId}/following`)} className="text-center"><p className="text-sm font-bold text-champagne">{followingCount}</p><p className="text-[10px] text-muted-foreground">Following</p></button>
            </div>
          </div>
        </div>

        {user?.id !== userId && (
          <div className="flex gap-2 mt-4">
            <button onClick={toggleFollow} className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 ${isFollowing ? "bg-surface border border-border text-foreground" : "gold-gradient text-primary-foreground"}`}>
              {isFollowing ? <><UserMinus className="size-4" /> Following</> : <><UserPlus className="size-4" /> Follow</>}
            </button>
            <button onClick={() => navigate(`/dm/${userId}`)} className="flex-1 py-2.5 rounded-xl bg-surface border border-border text-foreground text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2">
              <MessageCircle className="size-4" /> Message
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-[2px]">
        {posts.map((post) => (
          <button key={post.id} onClick={() => setViewingPost(post)} className="relative aspect-square bg-surface overflow-hidden block">
            {post.image_url ? <img src={post.image_url} className="w-full h-full object-cover" loading="lazy" /> :
              post.video_url ? (
                <div className="relative w-full h-full">
                  <video src={post.video_url} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20"><Play className="size-6 text-white fill-white" /></div>
                </div>
              ) :
              <div className="w-full h-full flex items-center justify-center p-2"><p className="text-xs text-muted-foreground text-center line-clamp-3">{post.content}</p></div>}
            {post.pinned_at && (
              <div className="absolute top-1 left-1 size-5 rounded-full bg-black/70 flex items-center justify-center">
                <Pin className="size-3 text-gold fill-gold" />
              </div>
            )}
          </button>
        ))}
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

export default UserProfilePage;
