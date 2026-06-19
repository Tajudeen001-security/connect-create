import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import PostCard from "@/components/PostCard";
import BottomNav from "@/components/BottomNav";
import Canonical from "@/components/Canonical";
import { timeAgo } from "@/lib/timeAgo";

const PostDetailPage = () => {
  const { postId } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!postId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("posts").select("*").eq("id", postId).maybeSingle();
      if (!data) { setPost(null); setLoading(false); return; }
      const { data: profile } = await supabase.from("profiles").select("username, avatar_url, is_verified").eq("user_id", data.user_id).maybeSingle();
      setPost({
        ...data,
        username: profile?.username || "user",
        avatarUrl: profile?.avatar_url || "",
        isVerified: profile?.is_verified || false,
      });
      setLoading(false);
    })();
  }, [postId]);

  return (
    <div className="min-h-screen pb-24">
      <Canonical path={`/post/${postId || ""}`} />
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/30">
        <div className="flex items-center gap-3 px-4 h-14">
          <button onClick={() => navigate(-1)} className="text-foreground"><ArrowLeft className="size-5" /></button>
          <h1 className="font-display italic text-lg text-gold">Post</h1>
        </div>
      </header>
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin text-gold" /></div>
      ) : !post ? (
        <p className="text-center text-sm text-muted-foreground mt-10">Post not found.</p>
      ) : (
        <PostCard
          id={post.id}
          username={post.username}
          avatarUrl={post.avatarUrl}
          imageUrl={post.image_url || ""}
          videoUrl={post.video_url || undefined}
          caption={post.content || ""}
          likes={0}
          comments={0}
          timeAgo={timeAgo(post.created_at)}
          isVerified={post.isVerified}
          userId={post.user_id}
          unlockPrice={post.unlock_price || 0}
          isPoll={post.is_poll || false}
          pollOptions={post.poll_options || null}
        />
      )}
      <BottomNav />
    </div>
  );
};

export default PostDetailPage;
