import { useState, useRef } from "react";
import { Camera, Image, Type, MapPin, Hash, X, Loader2, Coins, BarChart3, Plus, Sparkles, Wand2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";
import { generateCaption, generateImage } from "@/services/aiService";
const CreatePage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [content, setContent] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [location, setLocation] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [posting, setPosting] = useState(false);
  const [postType, setPostType] = useState<"post" | "story" | "poll">("post");
  const [unlockPrice, setUnlockPrice] = useState<number>(0);
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  // JagX AI post generator
  const [showAi, setShowAi] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiMode, setAiMode] = useState<"text" | "image" | "both">("both");
  const [aiBusy, setAiBusy] = useState(false);

  const generateWithAI = async () => {
  if (!aiPrompt.trim() || aiBusy) return;
  setAiBusy(true);
  
  try {
    // 1) Generate Caption / Text
    if (aiMode === "text" || aiMode === "both") {
      const caption = await generateCaption(aiPrompt);
      setContent(caption);
      
      // Auto-extract hashtags
      const tags = (caption.match(/#\w+/g) || []).map(t => t.replace(/^#/, ""));
      if (tags.length) setHashtags(tags.join(", "));
    }
    
    // 2) Generate Image
    if (aiMode === "image" || aiMode === "both") {
      const imageUrl = await generateImage(aiPrompt);
      setMediaPreview(imageUrl);
      setMediaType("image");
      
      // Convert URL to File for upload
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      setMediaFile(new File([blob], `jagx-ai-${Date.now()}.png`, { type: blob.type || "image/png" }));
    }
    
    toast.success("Generated! Review and post 🐆");
    setShowAi(false);
    
  } catch (e: any) {
    console.error("AI Error:", e);
    toast.error(e.message || "AI generation failed");
  } finally {
    setAiBusy(false);
  }
};

  const handleMedia = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMediaFile(file);
    setMediaType(file.type.startsWith("video") ? "video" : "image");
    const reader = new FileReader();
    reader.onload = () => setMediaPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handlePost = async () => {
    if (!user) return;
    if (postType !== "poll" && !content.trim() && !mediaFile) { toast.error("Add some content or media!"); return; }
    if (postType === "poll") {
      const cleaned = pollOptions.map(o => o.trim()).filter(Boolean);
      if (!content.trim()) { toast.error("Add a poll question"); return; }
      if (cleaned.length < 2) { toast.error("Add at least 2 poll options"); return; }
    }
    setPosting(true);

    try {
      let mediaUrl: string | null = null;

      if (mediaFile) {
        const ext = mediaFile.name.split(".").pop();
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("posts").upload(path, mediaFile);
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from("posts").getPublicUrl(path);
        mediaUrl = publicUrl;
      }

      const parsedTags = hashtags.split(/[,\s#]+/).filter(t => t.trim()).map(t => t.trim());

      if (postType === "story") {
        if (!mediaUrl) { toast.error("Stories need a photo or video!"); setPosting(false); return; }
        const { error } = await supabase.from("stories").insert({
          user_id: user.id, media_url: mediaUrl, media_type: mediaType, caption: content || null,
        });
        if (error) throw error;
        toast.success("Story posted! 🐆");
      } else if (postType === "poll") {
        const cleaned = pollOptions.map(o => o.trim()).filter(Boolean);
        const { error } = await supabase.from("posts").insert({
          user_id: user.id,
          content: content,
          post_type: "text",
          is_poll: true,
          poll_options: cleaned,
          hashtags: parsedTags.length > 0 ? parsedTags : null,
        });
        if (error) throw error;
        toast.success("Poll posted! 📊");
      } else {
        const { error } = await supabase.from("posts").insert({
          user_id: user.id,
          content: content || null,
          image_url: mediaType === "image" ? mediaUrl : null,
          video_url: mediaType === "video" ? mediaUrl : null,
          post_type: mediaFile ? mediaType : "text",
          hashtags: parsedTags.length > 0 ? parsedTags : null,
          unlock_price: unlockPrice,
        });
        if (error) throw error;
        toast.success("Posted! 🐆");
      }

      navigate("/");
    } catch (err: any) {
      toast.error(err.message || "Failed to post");
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/30">
        <div className="flex items-center justify-between px-4 h-14">
          <h1 className="font-display italic text-xl text-gold">Create</h1>
          <button onClick={handlePost} disabled={posting}
            className="px-4 py-1.5 rounded-lg gold-gradient text-primary-foreground text-xs font-bold uppercase tracking-widest disabled:opacity-50 flex items-center gap-2">
            {posting && <Loader2 className="size-3 animate-spin" />}
            {posting ? "Posting..." : "Post"}
          </button>
        </div>
      </header>

      <div className="p-4 space-y-4">
        {/* JagX AI generator */}
        <button onClick={() => setShowAi(s => !s)}
          className="w-full p-3 rounded-xl border border-gold/40 bg-surface flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-gold" />
            <span className="text-sm text-foreground">Generate with JagX Buddy AI</span>
          </div>
          <span className="text-[10px] uppercase tracking-widest text-gold">{showAi ? "Hide" : "Open"}</span>
        </button>
        {showAi && (
          <div className="p-4 rounded-xl bg-surface border border-gold/30 space-y-3">
            <textarea
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
              placeholder="Describe your post… e.g. 'Motivational Monday quote for African creators, gold/black vibe'"
              className="w-full bg-background border border-border rounded-lg p-3 text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none"
              rows={3}
            />
            <div className="flex gap-2">
              {(["text","image","both"] as const).map(m => (
                <button key={m} onClick={() => setAiMode(m)}
                  className={`flex-1 py-2 rounded-lg text-[10px] uppercase tracking-widest font-bold ${aiMode===m ? "gold-gradient text-primary-foreground" : "bg-background border border-border text-foreground"}`}>
                  {m === "both" ? "Caption + Image" : m === "text" ? "Caption only" : "Image only"}
                </button>
              ))}
            </div>
            <button onClick={generateWithAI} disabled={aiBusy || !aiPrompt.trim()}
              className="w-full py-2.5 rounded-lg gold-gradient text-primary-foreground text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50">
              {aiBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
              {aiBusy ? "Generating…" : "Generate"}
            </button>
            <p className="text-[10px] text-muted-foreground">Free for everyone. Review and edit before posting.</p>
          </div>
        )}

        {/* Post type toggle */}
        <div className="flex gap-2">
          <button onClick={() => setPostType("post")}
            className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors ${postType === "post" ? "gold-gradient text-primary-foreground" : "bg-surface border border-border text-foreground"}`}>
            Post
          </button>
          <button onClick={() => setPostType("story")}
            className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors ${postType === "story" ? "gold-gradient text-primary-foreground" : "bg-surface border border-border text-foreground"}`}>
            Story
          </button>
          <button onClick={() => setPostType("poll")}
            className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors ${postType === "poll" ? "gold-gradient text-primary-foreground" : "bg-surface border border-border text-foreground"}`}>
            Poll
          </button>
        </div>

        {/* Text area */}
        <div className="p-4 rounded-xl bg-surface border border-border/30 min-h-[120px]">
          <textarea
            placeholder={postType === "story" ? "Add a caption to your story..." : postType === "poll" ? "Ask a question..." : "What's on your mind? Use @ to tag"}
            value={content}
            onChange={e => setContent(e.target.value)}
            className="w-full bg-transparent text-foreground placeholder:text-muted-foreground outline-none resize-none text-sm"
            rows={4}
          />
        </div>

        {/* Poll options builder */}
        {postType === "poll" && (
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2"><BarChart3 className="size-3.5" /> Options</label>
            {pollOptions.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={opt} onChange={e => setPollOptions(prev => prev.map((p, j) => j === i ? e.target.value : p))}
                  placeholder={`Option ${i + 1}`}
                  className="flex-1 px-3 py-2 rounded-xl bg-surface border border-border text-sm text-foreground placeholder:text-muted-foreground outline-none" />
                {pollOptions.length > 2 && (
                  <button onClick={() => setPollOptions(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground"><X className="size-4" /></button>
                )}
              </div>
            ))}
            {pollOptions.length < 6 && (
              <button onClick={() => setPollOptions(prev => [...prev, ""])} className="flex items-center gap-2 text-xs text-gold">
                <Plus className="size-3.5" /> Add option
              </button>
            )}
          </div>
        )}

        {/* Monetization */}
        {postType === "post" && (
          <div className="p-4 rounded-xl bg-surface border border-border/30 space-y-2">
            <label className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2"><Coins className="size-3.5 text-gold" /> Premium unlock price (JagX coins)</label>
            <input type="number" min={0} value={unlockPrice} onChange={e => setUnlockPrice(Math.max(0, parseInt(e.target.value || "0", 10)))}
              placeholder="0 = free for everyone"
              className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground outline-none" />
            <p className="text-[10px] text-muted-foreground">Set 0 to keep public. Viewers pay this in JagX coins to unlock. You receive 70%, platform takes 30%.</p>
          </div>
        )}

        {/* Media preview */}
        {mediaPreview && (
          <div className="relative rounded-xl overflow-hidden">
            {mediaType === "video" ? (
              <video src={mediaPreview} className="w-full max-h-64 object-cover rounded-xl" controls />
            ) : (
              <img src={mediaPreview} className="w-full max-h-64 object-cover rounded-xl" />
            )}
            <button onClick={() => { setMediaFile(null); setMediaPreview(null); }}
              className="absolute top-2 right-2 size-7 rounded-full bg-black/60 flex items-center justify-center">
              <X className="size-4 text-white" />
            </button>
          </div>
        )}

        {/* Media options */}
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => cameraRef.current?.click()}
            className="flex items-center gap-3 p-4 rounded-xl bg-surface border border-border/30 active:bg-surface-elevated transition-colors">
            <Camera className="size-5 text-gold" />
            <span className="text-sm text-foreground">Camera</span>
            <input ref={cameraRef} type="file" accept="image/*,video/*" capture="environment" onChange={handleMedia} className="hidden" />
          </button>
          <button onClick={() => fileRef.current?.click()}
            className="flex items-center gap-3 p-4 rounded-xl bg-surface border border-border/30 active:bg-surface-elevated transition-colors">
            <Image className="size-5 text-blue-400" />
            <span className="text-sm text-foreground">Gallery</span>
            <input ref={fileRef} type="file" accept="image/*,video/*" onChange={handleMedia} className="hidden" />
          </button>
        </div>

        {/* Hashtags */}
        <div className="space-y-2">
          <button className="flex items-center justify-between w-full p-4 rounded-xl bg-surface border border-border/30">
            <div className="flex items-center gap-3">
              <Hash className="size-5 text-muted-foreground" />
              <input type="text" placeholder="Add hashtags (comma separated)" value={hashtags} onChange={e => setHashtags(e.target.value)}
                className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none flex-1" />
            </div>
          </button>
          <button className="flex items-center justify-between w-full p-4 rounded-xl bg-surface border border-border/30">
            <div className="flex items-center gap-3">
              <MapPin className="size-5 text-muted-foreground" />
              <input type="text" placeholder="Add location" value={location} onChange={e => setLocation(e.target.value)}
                className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none flex-1" />
            </div>
          </button>
        </div>
      </div>

      <BottomNav />
    </div>
  );
};

export default CreatePage;
