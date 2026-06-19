import { Heart, MessageCircle, Share2, Bookmark, MoreHorizontal, Send, UserPlus, Gift, Trash2, Edit3, X, Check, Forward, Reply } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import TaggedText from "@/components/TaggedText";
import PollBlock from "@/components/PollBlock";
import PaywallOverlay from "@/components/PaywallOverlay";

interface PostCardProps {
  id?: string;
  username: string;
  avatarUrl: string;
  imageUrl: string;
  videoUrl?: string;
  caption: string;
  likes: number;
  comments: number;
  timeAgo: string;
  location?: string;
  isVerified?: boolean;
  isOnline?: boolean;
  userId?: string;
  onFollow?: () => void;
  showFollow?: boolean;
  onDelete?: () => void;
  onEdit?: (newContent: string) => void;
  unlockPrice?: number;
  isPoll?: boolean;
  pollOptions?: string[] | null;
}

const PostCard = ({
  id, username, avatarUrl, imageUrl, videoUrl, caption, likes, comments, timeAgo, location, isVerified, isOnline, userId, onFollow, showFollow, onDelete, onEdit,
  unlockPrice = 0, isPoll = false, pollOptions = null,
}: PostCardProps) => {
  const { user } = useAuth();
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [likeCount, setLikeCount] = useState(likes);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [dbComments, setDbComments] = useState<any[]>([]);
  const [showMenu, setShowMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(caption);
  const [showGift, setShowGift] = useState(false);
  const [giftAmount, setGiftAmount] = useState(10);
  const [showForward, setShowForward] = useState(false);
  const [forwardSearch, setForwardSearch] = useState("");
  const [forwardResults, setForwardResults] = useState<any[]>([]);
  const [replyTo, setReplyTo] = useState<{ id: string; username: string } | null>(null);
  const navigate = useNavigate();

  const isOwner = user?.id === userId;
  const requiresUnlock = !!id && unlockPrice > 0 && !isOwner && !unlocked;

  const shareLink = async () => {
    if (!id) return;
    // Production share domain → edge-rendered preview (/p/:id) with OG tags +
    // crawlable HTML for WhatsApp / Facebook / Twitter / Google.
    const url = `https://jagx-buddy-connect.name.ng/p/${id}`;
    const text = caption ? `${caption.slice(0, 100)}${caption.length > 100 ? "…" : ""}` : `Check out @${username} on JagX Buddy Connect`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `@${username} on JagX`, text, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied!");
      }
    } catch {
      try { await navigator.clipboard.writeText(url); toast.success("Link copied!"); } catch {}
    }
  };

  useEffect(() => {
    if (!user || !id) return;
    supabase.from("likes").select("id").eq("post_id", id).eq("user_id", user.id).single()
      .then(({ data }) => { if (data) setLiked(true); });
    supabase.from("likes").select("id", { count: "exact" }).eq("post_id", id)
      .then(({ count }) => { if (count !== null) setLikeCount(count); });
  }, [user, id]);

  useEffect(() => { if (id) loadComments(); }, [id]);

  const loadComments = async () => {
    if (!id) return;
    const { data } = await supabase.from("comments").select("*").eq("post_id", id).order("created_at", { ascending: true });
    if (!data) return;
    const userIds = [...new Set(data.map(c => c.user_id))];
    if (userIds.length === 0) { setDbComments([]); return; }
    const { data: profiles } = await supabase.from("profiles").select("user_id, username, avatar_url").in("user_id", userIds);
    const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
    setDbComments(data.map(c => ({ ...c, username: profileMap.get(c.user_id)?.username || "user" })));
  };

  useEffect(() => {
    if (!id) return;
    const channel = supabase.channel(`post-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "likes", filter: `post_id=eq.${id}` }, () => {
        supabase.from("likes").select("id", { count: "exact" }).eq("post_id", id)
          .then(({ count }) => { if (count !== null) setLikeCount(count); });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "comments", filter: `post_id=eq.${id}` }, () => loadComments())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  const handleLike = async () => {
    if (!user || !id) return;
    if (liked) {
      setLiked(false); setLikeCount(prev => prev - 1);
      await supabase.from("likes").delete().eq("post_id", id).eq("user_id", user.id);
    } else {
      setLiked(true); setLikeCount(prev => prev + 1);
      await supabase.from("likes").insert({ post_id: id, user_id: user.id });
      if (userId && userId !== user.id) {
        await supabase.from("notifications").insert({ user_id: userId, from_user_id: user.id, type: "like", content: "liked your post", related_post_id: id });
      }
    }
  };

  const addComment = async () => {
    if (!commentText.trim() || !user || !id) return;
    const text = commentText.trim();
    const content = replyTo ? `@${replyTo.username} ${text}` : text;
    setCommentText(""); setReplyTo(null);

    const insertData: any = { post_id: id, user_id: user.id, content };
    if (replyTo) insertData.parent_id = replyTo.id;

    await supabase.from("comments").insert(insertData);
    if (userId && userId !== user.id) {
      await supabase.from("notifications").insert({ user_id: userId, from_user_id: user.id, type: "comment", content: `commented: ${text.slice(0, 50)}`, related_post_id: id });
    }
    loadComments();
  };

  const handleDelete = async () => {
    if (!id || !user) return;
    const { error } = await supabase.from("posts").delete().eq("id", id).eq("user_id", user.id);
    if (error) toast.error("Failed to delete post");
    else { toast.success("Post deleted"); onDelete?.(); }
    setShowMenu(false);
  };

  const handleEdit = async () => {
    if (!id || !user) return;
    const { error } = await supabase.from("posts").update({ content: editText }).eq("id", id).eq("user_id", user.id);
    if (error) toast.error("Failed to edit");
    else { toast.success("Post updated"); onEdit?.(editText); setEditing(false); }
  };

  const sendGift = async () => {
    if (!user || !userId || !id) return;
    const { error } = await supabase.from("gifts").insert({ sender_id: user.id, recipient_id: userId, post_id: id, coin_amount: giftAmount, gift_type: "post" });
    if (error) toast.error(error.message || "Failed to send gift");
    else toast.success(`🎁 Sent ${giftAmount} coins!`);
    setShowGift(false);
  };

  const shareToStory = async () => {
    if (!user) return;
    const mediaUrl = imageUrl || videoUrl;
    if (!mediaUrl) return;
    const { error } = await supabase.from("stories").insert({ user_id: user.id, media_url: mediaUrl, media_type: videoUrl ? "video" : "image", caption: `Shared from @${username}: ${caption?.slice(0, 100) || ""}` });
    if (error) toast.error("Failed to share");
    else toast.success("Shared to your story! 🐆");
    setShowMenu(false);
  };

  const searchForForward = async (q: string) => {
    setForwardSearch(q);
    if (q.length < 2) { setForwardResults([]); return; }
    const { data } = await supabase.from("profiles").select("user_id, username, avatar_url").ilike("username", `%${q}%`).limit(10);
    setForwardResults(data || []);
  };

  const forwardPost = async (targetUserId: string) => {
    if (!user) return;
    const content = `📤 Forwarded post from @${username}: ${caption?.slice(0, 100) || ""}\n${imageUrl || videoUrl || ""}`;
    await supabase.from("messages").insert({ sender_id: user.id, receiver_id: targetUserId, content, message_type: "text" });
    toast.success("Post forwarded!");
    setShowForward(false);
  };

  const formatCount = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

  // Build threaded comments
  const topLevelComments = dbComments.filter(c => !c.parent_id);
  const replies = dbComments.filter(c => c.parent_id);
  const repliesMap = new Map<string, any[]>();
  replies.forEach(r => {
    const arr = repliesMap.get(r.parent_id) || [];
    arr.push(r);
    repliesMap.set(r.parent_id, arr);
  });

  return (
    <article className="border-b border-border/50 pb-4">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={() => userId && navigate(`/user/${userId}`)} className="flex items-center gap-3">
          <div className="relative size-9 rounded-full border border-gold/20 p-[1px]">
            <img src={avatarUrl} alt={username} className="w-full h-full rounded-full object-cover" />
            {isOnline && (
              <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-green-500 border-2 border-background" aria-label="Online" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-champagne">{username}</span>
              {isVerified && <span className="text-gold text-xs">✓</span>}
            </div>
            {location && <span className="text-[10px] text-muted-foreground">{location}</span>}
          </div>
        </button>
        <div className="flex items-center gap-2">
          {showFollow && <button onClick={onFollow} className="px-3 py-1 rounded-lg gold-gradient text-primary-foreground text-[10px] font-bold uppercase tracking-widest"><UserPlus className="size-3" /></button>}
          <div className="relative">
            <button onClick={() => setShowMenu(!showMenu)} className="text-muted-foreground"><MoreHorizontal className="size-5" /></button>
            {showMenu && (
              <div className="absolute top-full right-0 mt-1 w-44 rounded-xl bg-surface border border-border/30 shadow-xl z-50 overflow-hidden">
                <button onClick={shareToStory} className="w-full px-4 py-2.5 text-left text-xs text-foreground hover:bg-surface-elevated flex items-center gap-2"><Share2 className="size-3" /> Share to Story</button>
                <button onClick={() => { setShowForward(true); setShowMenu(false); }} className="w-full px-4 py-2.5 text-left text-xs text-foreground hover:bg-surface-elevated flex items-center gap-2"><Forward className="size-3" /> Forward</button>
                {isOwner && (
                  <>
                    <button onClick={() => { setEditing(true); setShowMenu(false); }} className="w-full px-4 py-2.5 text-left text-xs text-foreground hover:bg-surface-elevated flex items-center gap-2"><Edit3 className="size-3" /> Edit Post</button>
                    <button onClick={handleDelete} className="w-full px-4 py-2.5 text-left text-xs text-red-400 hover:bg-surface-elevated flex items-center gap-2"><Trash2 className="size-3" /> Delete Post</button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {editing && (
        <div className="px-4 pb-2 flex items-center gap-2">
          <input value={editText} onChange={e => setEditText(e.target.value)} className="flex-1 text-sm bg-surface border border-border rounded-lg px-3 py-2 text-foreground outline-none" />
          <button onClick={handleEdit} className="text-gold"><Check className="size-5" /></button>
          <button onClick={() => setEditing(false)} className="text-muted-foreground"><X className="size-5" /></button>
        </div>
      )}

      {/* Media or Text-only display */}
      {isPoll && pollOptions && id ? (
        <>
          {caption && (
            <div className="px-4 py-3">
              <TaggedText text={caption} className="text-base text-foreground leading-relaxed whitespace-pre-wrap" />
            </div>
          )}
          <PollBlock postId={id} options={pollOptions} />
        </>
      ) : (videoUrl || imageUrl) ? (
        <div className="relative aspect-square bg-surface overflow-hidden">
          {videoUrl ? <video src={videoUrl} className="w-full h-full object-cover" controls playsInline preload="metadata" onDoubleClick={handleLike} /> :
            <img src={imageUrl} alt="Post" className="w-full h-full object-cover" loading="lazy" onDoubleClick={handleLike} />}
          <AnimatePresence>
            {liked && <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} className="absolute inset-0 flex items-center justify-center pointer-events-none"><Heart className="size-20 text-red-500 fill-red-500" /></motion.div>}
          </AnimatePresence>
          {requiresUnlock && id && userId && (
            <PaywallOverlay postId={id} ownerId={userId} price={unlockPrice} onUnlocked={() => setUnlocked(true)} />
          )}
        </div>
      ) : caption ? (
        <div className="relative px-4 py-6 bg-gradient-to-br from-surface to-surface-elevated rounded-lg mx-2 my-1 min-h-[120px] flex items-center" onDoubleClick={handleLike}>
          <TaggedText text={caption} className="text-base text-foreground leading-relaxed whitespace-pre-wrap" />
          {requiresUnlock && id && userId && (
            <PaywallOverlay postId={id} ownerId={userId} price={unlockPrice} onUnlocked={() => setUnlocked(true)} />
          )}
        </div>
      ) : null}

      {/* Actions */}
      <div className="px-4 pt-3 flex items-center justify-between">
        <div className="flex items-center gap-5">
          <motion.button whileTap={{ scale: 1.3 }} onClick={handleLike} className={liked ? "text-red-500" : "text-foreground"}>
            <Heart className={`size-6 ${liked ? "fill-current" : ""}`} />
          </motion.button>
          <button onClick={() => setShowComments(!showComments)} className="text-foreground"><MessageCircle className="size-6" /></button>
          <button onClick={shareLink} className="text-foreground" aria-label="Share post"><Share2 className="size-6" /></button>
          <button onClick={() => setShowForward(true)} className="text-foreground" aria-label="Forward to user"><Forward className="size-6" /></button>
          {!isOwner && userId && <button onClick={() => setShowGift(!showGift)} className="text-gold"><Gift className="size-5" /></button>}
        </div>
        <motion.button whileTap={{ scale: 1.2 }} onClick={() => setSaved(!saved)} className={saved ? "text-gold" : "text-foreground"}>
          <Bookmark className={`size-6 ${saved ? "fill-current" : ""}`} />
        </motion.button>
      </div>

      {/* Gift */}
      <AnimatePresence>
        {showGift && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-4 pt-2 overflow-hidden">
            <div className="flex items-center gap-2">
              {[10, 50, 100, 500].map(amt => (
                <button key={amt} onClick={() => setGiftAmount(amt)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${giftAmount === amt ? "gold-gradient text-primary-foreground" : "bg-surface border border-border text-foreground"}`}>🪙 {amt}</button>
              ))}
              <button onClick={sendGift} className="px-3 py-1.5 rounded-lg gold-gradient text-primary-foreground text-xs font-bold">Send</button>
            </div>
            <p className="text-[9px] text-muted-foreground mt-1">30% platform fee applies</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Likes & Caption */}
      <div className="px-4 pt-2">
        <p className="text-sm font-semibold text-champagne">{formatCount(likeCount)} appreciations</p>
        {!editing && (videoUrl || imageUrl) && caption && (
          <p className="text-sm mt-1">
            <span className="font-semibold text-champagne">{username} </span>
            <TaggedText text={caption} className="text-foreground/80" />
          </p>
        )}
        {!editing && !(videoUrl || imageUrl) && <p className="text-sm mt-1 font-semibold text-champagne">{username}</p>}
        <button onClick={() => setShowComments(!showComments)} className="text-xs text-muted-foreground mt-1">{dbComments.length || comments} comments</button>
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">{timeAgo}</p>
      </div>

      {/* Comments with replies */}
      {showComments && (
        <div className="px-4 pt-2 space-y-2">
          {topLevelComments.map(c => (
            <div key={c.id}>
              <div className="flex items-start gap-2">
                <p className="text-sm flex-1">
                  <span className="font-semibold text-champagne">{c.username} </span>
                  <TaggedText text={c.content} className="text-foreground/80" />
                </p>
                <button onClick={() => setReplyTo({ id: c.id, username: c.username })} className="shrink-0 text-muted-foreground"><Reply className="size-3" /></button>
              </div>
              {/* Replies */}
              {repliesMap.get(c.id)?.map(r => (
                <div key={r.id} className="ml-6 mt-1">
                  <p className="text-xs">
                    <span className="font-semibold text-champagne">{r.username} </span>
                    <TaggedText text={r.content} className="text-foreground/70" />
                  </p>
                </div>
              ))}
            </div>
          ))}
          {replyTo && (
            <div className="flex items-center gap-2 text-xs text-gold">
              <Reply className="size-3" /> Replying to @{replyTo.username}
              <button onClick={() => setReplyTo(null)}><X className="size-3" /></button>
            </div>
          )}
          <div className="flex items-center gap-2 mt-2">
            <input type="text" placeholder={replyTo ? `Reply to @${replyTo.username}...` : "Add a comment..."} value={commentText} onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addComment()}
              className="flex-1 text-sm bg-transparent border-b border-border/30 py-1.5 text-foreground placeholder:text-muted-foreground outline-none" />
            <button onClick={addComment} disabled={!commentText.trim()} className="text-gold disabled:opacity-30"><Send className="size-4" /></button>
          </div>
        </div>
      )}

      {/* Forward dialog */}
      {showForward && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
            <span className="text-sm font-semibold text-champagne">Forward to...</span>
            <button onClick={() => setShowForward(false)}><X className="size-5 text-foreground" /></button>
          </div>
          <div className="p-4">
            <input type="text" placeholder="Search users..." value={forwardSearch} onChange={e => searchForForward(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-surface border border-border text-sm text-foreground placeholder:text-muted-foreground outline-none" />
          </div>
          <div className="flex-1 overflow-y-auto px-4 space-y-2">
            {forwardResults.map(p => (
              <button key={p.user_id} onClick={() => forwardPost(p.user_id)} className="w-full flex items-center gap-3 p-3 rounded-xl bg-surface border border-border/30">
                <div className="size-10 rounded-full bg-surface overflow-hidden border border-border">
                  {p.avatar_url ? <img src={p.avatar_url} className="w-full h-full object-cover" /> :
                    <div className="w-full h-full flex items-center justify-center text-gold font-bold">{(p.username || "U")[0].toUpperCase()}</div>}
                </div>
                <span className="text-sm text-champagne font-semibold">{p.username}</span>
                <Forward className="size-4 text-gold ml-auto" />
              </button>
            ))}
          </div>
        </div>
      )}
    </article>
  );
};

export default PostCard;
