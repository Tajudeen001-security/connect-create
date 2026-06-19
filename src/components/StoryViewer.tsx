import { useState, useEffect } from "react";
import { X, Eye, ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

interface Story {
  id: string;
  user_id: string;
  media_url: string;
  media_type: string;
  caption: string | null;
  created_at: string;
  username?: string;
  avatar_url?: string;
  is_verified?: boolean;
}

interface StoryViewerProps {
  stories: Story[];
  initialIndex: number;
  onClose: () => void;
}

const StoryViewer = ({ stories, initialIndex, onClose }: StoryViewerProps) => {
  const { user } = useAuth();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [viewCount, setViewCount] = useState(0);
  const [viewers, setViewers] = useState<any[]>([]);
  const [showViewers, setShowViewers] = useState(false);
  const [flyEmoji, setFlyEmoji] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const story = stories[currentIndex];
  const isOwner = story?.user_id === user?.id;

  // Record view & auto-progress
  useEffect(() => {
    if (!story || !user) return;
    // Record view
    if (!isOwner) {
      supabase.from("story_views").upsert({ story_id: story.id, viewer_id: user.id }, { onConflict: "story_id,viewer_id" });
    }
    // Load view count
    supabase.from("story_views").select("id", { count: "exact" }).eq("story_id", story.id)
      .then(({ count }) => setViewCount(count || 0));

    // Auto-progress
    setProgress(0);
    const duration = 5000;
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          if (currentIndex < stories.length - 1) setCurrentIndex(i => i + 1);
          else onClose();
          return 0;
        }
        return prev + (100 / (duration / 50));
      });
    }, 50);
    return () => clearInterval(interval);
  }, [currentIndex, story?.id]);

  const loadViewers = async () => {
    if (!story) return;
    const { data } = await supabase.from("story_views").select("viewer_id, created_at").eq("story_id", story.id);
    if (data && data.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("user_id, username, avatar_url").in("user_id", data.map(v => v.viewer_id));
      setViewers(profiles || []);
    }
    setShowViewers(true);
  };

  const sendReaction = async (emoji: string) => {
    if (!user || !story || isOwner) return;
    setFlyEmoji(emoji);
    setTimeout(() => setFlyEmoji(null), 1200);
    await supabase.from("notifications").insert({
      user_id: story.user_id,
      from_user_id: user.id,
      type: "story_view",
      content: `reacted ${emoji} to your story`,
    });
  };

  const sendReply = async () => {
    if (!user || !story || !reply.trim() || isOwner) return;
    const { error } = await supabase.from("messages").insert({
      sender_id: user.id,
      receiver_id: story.user_id,
      content: `↳ Replied to your story: ${reply.trim()}`,
    });
    if (error) toast.error("Couldn't send reply"); else toast.success("Reply sent");
    setReply("");
  };

  if (!story) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      {/* Progress bars */}
      <div className="flex gap-1 p-2 pt-3">
        {stories.map((_, i) => (
          <div key={i} className="flex-1 h-0.5 rounded-full bg-white/20 overflow-hidden">
            <div className="h-full bg-gold rounded-full transition-all duration-50" style={{ width: i < currentIndex ? "100%" : i === currentIndex ? `${progress}%` : "0%" }} />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-full bg-surface overflow-hidden">
            {story.avatar_url ? <img src={story.avatar_url} className="w-full h-full object-cover" /> :
              <div className="w-full h-full flex items-center justify-center text-gold text-sm font-display italic">{(story.username || "U")[0].toUpperCase()}</div>}
          </div>
          <span className="text-sm font-semibold text-white">{story.username || "User"}</span>
          {story.is_verified && <span className="text-gold text-xs">✓</span>}
          <span className="text-[10px] text-white/50">{new Date(story.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
        <button onClick={onClose} className="text-white"><X className="size-6" /></button>
      </div>

      {/* Story content */}
      <div className="flex-1 relative flex items-center justify-center">
        <img src={story.media_url} className="max-w-full max-h-full object-contain" />
        {story.caption && (
          <div className="absolute bottom-8 left-4 right-4 p-3 rounded-xl bg-black/50 backdrop-blur-sm">
            <p className="text-sm text-white">{story.caption}</p>
          </div>
        )}

        {/* Nav areas */}
        <button onClick={() => currentIndex > 0 && setCurrentIndex(i => i - 1)} className="absolute left-0 top-0 bottom-0 w-1/3" />
        <button onClick={() => currentIndex < stories.length - 1 ? setCurrentIndex(i => i + 1) : onClose()} className="absolute right-0 top-0 bottom-0 w-1/3" />
      </div>

      {/* Footer - view count for owner */}
      {isOwner && (
        <button onClick={loadViewers} className="flex items-center justify-center gap-2 py-4 text-white/70">
          <Eye className="size-4" />
          <span className="text-sm">{viewCount} views</span>
        </button>
      )}

      {/* Reactions + reply (non-owner) */}
      {!isOwner && (
        <div className="px-4 pb-4 pt-2 space-y-2 relative">
          <AnimatePresence>
            {flyEmoji && (
              <motion.div
                initial={{ y: 0, opacity: 1, scale: 1 }}
                animate={{ y: -180, opacity: 0, scale: 2 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.2 }}
                className="absolute left-1/2 -translate-x-1/2 bottom-20 text-4xl pointer-events-none"
              >
                {flyEmoji}
              </motion.div>
            )}
          </AnimatePresence>
          <div className="flex items-center justify-around">
            {["❤️","🔥","😂","😮","👏","🐆"].map(e => (
              <button key={e} onClick={() => sendReaction(e)} className="text-2xl active:scale-125 transition-transform">{e}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              value={reply}
              onChange={e => setReply(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendReply()}
              placeholder={`Reply to ${story.username || "story"}...`}
              className="flex-1 px-3 py-2 rounded-full bg-white/10 border border-white/20 text-sm text-white placeholder:text-white/50 outline-none"
            />
            <button onClick={sendReply} disabled={!reply.trim()} className="text-gold text-sm font-bold disabled:opacity-30">Send</button>
          </div>
        </div>
      )}

      {/* Viewers modal */}
      {showViewers && (
        <div className="absolute inset-0 bg-black/80 z-10 flex items-end">
          <div className="w-full max-h-[60vh] bg-surface rounded-t-2xl p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-champagne">Viewers ({viewCount})</h3>
              <button onClick={() => setShowViewers(false)} className="text-muted-foreground"><X className="size-5" /></button>
            </div>
            <div className="space-y-3 overflow-y-auto">
              {viewers.map(v => (
                <div key={v.user_id} className="flex items-center gap-3">
                  <div className="size-9 rounded-full bg-surface-elevated overflow-hidden">
                    {v.avatar_url ? <img src={v.avatar_url} className="w-full h-full object-cover" /> :
                      <div className="w-full h-full flex items-center justify-center text-gold text-xs">{(v.username || "U")[0].toUpperCase()}</div>}
                  </div>
                  <span className="text-sm text-foreground">@{v.username || "user"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StoryViewer;
