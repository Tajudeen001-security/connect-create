import { useState, useEffect } from "react";
import { Search, UserPlus, BadgeCheck, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";
import StructuredData from "@/components/StructuredData";

interface Profile {
  id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_verified: boolean;
}

const suggestedAvatars = [
  "https://picsum.photos/id/64/100/100",
  "https://picsum.photos/id/65/100/100",
  "https://picsum.photos/id/66/100/100",
  "https://picsum.photos/id/67/100/100",
  "https://picsum.photos/id/68/100/100",
  "https://picsum.photos/id/91/100/100",
];

const DiscoverPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchSuggestedProfiles();
    if (user) fetchFollowing();
  }, [user]);

  const fetchSuggestedProfiles = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .neq("user_id", user?.id || "")
      .limit(30);
    if (data) {
      // Pin the JagX founder / admin to the top of suggestions.
      const sorted = [...data].sort((a, b) => {
        const aFounder = (a.username || "").toLowerCase().includes("jagx") || a.is_verified ? 1 : 0;
        const bFounder = (b.username || "").toLowerCase().includes("jagx") || b.is_verified ? 1 : 0;
        return bFounder - aFounder;
      });
      setProfiles(sorted);
    }
  };

  const fetchFollowing = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("followers")
      .select("following_id")
      .eq("follower_id", user.id);
    if (data) setFollowedIds(new Set(data.map((f) => f.following_id)));
  };

  const searchProfiles = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      fetchSuggestedProfiles();
      return;
    }
    // Record search term for smart feed ranking (hashtag/keyword affinity)
    if (query.trim().length > 2) {
      import("@/lib/feedRank").then((m) => m.pushRecentSearch(query)).catch(() => {});
    }
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
      .neq("user_id", user?.id || "")
      .limit(20);
    if (data) setProfiles(data);
    setLoading(false);
  };

  const handleFollow = async (profileUserId: string) => {
    if (!user) {
      navigate("/auth");
      return;
    }
    try {
      if (followedIds.has(profileUserId)) {
        await supabase
          .from("followers")
          .delete()
          .eq("follower_id", user.id)
          .eq("following_id", profileUserId);
        setFollowedIds((prev) => {
          const next = new Set(prev);
          next.delete(profileUserId);
          return next;
        });
        toast.success("Unfollowed");
      } else {
        await supabase.from("followers").insert({
          follower_id: user.id,
          following_id: profileUserId,
        });
        // Create notification
        await supabase.from("notifications").insert({
          user_id: profileUserId,
          from_user_id: user.id,
          type: "follow",
          content: `${user.user_metadata?.username || "Someone"} started following you`,
        });
        setFollowedIds((prev) => new Set(prev).add(profileUserId));
        toast.success("Following!");
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="min-h-screen pb-24">
      <StructuredData id="discover" data={{
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Discover creators on JagX Connect",
        description: "Find and follow verified creators, friends, and trending profiles on JagX Connect.",
        url: typeof window !== "undefined" ? window.location.origin + "/discover" : "",
        potentialAction: {
          "@type": "SearchAction",
          target: (typeof window !== "undefined" ? window.location.origin : "") + "/discover?q={query}",
          "query-input": "required name=query",
        },
      }} />
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/30">
        <div className="flex items-center gap-3 px-4 h-14">
          <button onClick={() => navigate(-1)} className="text-foreground">
            <ArrowLeft className="size-5" />
          </button>
          <h1 className="font-display italic text-xl text-gold">Discover</h1>
        </div>
      </header>

      {/* Search */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-surface border border-border/30">
          <Search className="size-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search people..."
            value={searchQuery}
            onChange={(e) => searchProfiles(e.target.value)}
            className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none flex-1"
          />
        </div>
      </div>

      <div className="px-4">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
          {searchQuery ? "Search Results" : "Suggested for You"}
        </p>

        {profiles.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground text-center py-8">
            {searchQuery ? "No users found" : "No suggestions yet. Be the first to join!"}
          </p>
        )}

        <div className="space-y-3">
          {profiles.map((profile, i) => {
            const isFollowing = followedIds.has(profile.user_id);
            return (
              <div key={profile.id} className="flex items-center gap-3 p-3 rounded-xl bg-surface border border-border/30">
                <div className="size-12 rounded-full overflow-hidden bg-onyx shrink-0">
                  <img
                    src={profile.avatar_url || suggestedAvatars[i % suggestedAvatars.length]}
                    alt={profile.username || "user"}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="text-sm font-semibold text-champagne truncate">
                      {profile.display_name || profile.username || "User"}
                    </p>
                    {profile.is_verified && <BadgeCheck className="size-3.5 text-gold shrink-0" />}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    @{profile.username || "user"}
                  </p>
                  {profile.bio && (
                    <p className="text-xs text-muted-foreground/70 truncate mt-0.5">{profile.bio}</p>
                  )}
                </div>
                <button
                  onClick={() => handleFollow(profile.user_id)}
                  className={`shrink-0 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors ${
                    isFollowing
                      ? "bg-surface border border-border text-muted-foreground"
                      : "gold-gradient text-primary-foreground"
                  }`}
                >
                  {isFollowing ? "Following" : "Follow"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <BottomNav />
    </div>
  );
};

export default DiscoverPage;
