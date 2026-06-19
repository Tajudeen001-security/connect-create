import { useEffect, useRef, useState } from "react";
import { Scissors, Square, UploadCloud } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface Props {
  videoTrack: MediaStreamTrack | null;
  liveStreamId?: string;
}

/**
 * Records short highlight clips from the broadcaster's live MediaStreamTrack.
 * On stop, uploads the clip to the `posts` storage bucket and creates a reel post.
 */
const LiveClipRecorder = ({ videoTrack, liveStreamId }: Props) => {
  const { user } = useAuth();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [uploading, setUploading] = useState(false);
  const tickRef = useRef<any>(null);

  useEffect(() => () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try { recorderRef.current.stop(); } catch {}
    }
    clearInterval(tickRef.current);
  }, []);

  const start = () => {
    if (!videoTrack) { toast.error("No video to record yet"); return; }
    chunksRef.current = [];
    const stream = new MediaStream([videoTrack]);
    let mime = "video/webm;codecs=vp9";
    if (!MediaRecorder.isTypeSupported(mime)) mime = "video/webm;codecs=vp8";
    if (!MediaRecorder.isTypeSupported(mime)) mime = "video/webm";
    const rec = new MediaRecorder(stream, { mimeType: mime });
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    rec.onstop = () => upload();
    rec.start(1000);
    recorderRef.current = rec;
    setRecording(true);
    setElapsed(0);
    tickRef.current = setInterval(() => {
      setElapsed((s) => {
        if (s >= 60) { stop(); return s; }
        return s + 1;
      });
    }, 1000);
  };

  const stop = () => {
    if (!recorderRef.current) return;
    if (recorderRef.current.state !== "inactive") recorderRef.current.stop();
    setRecording(false);
    clearInterval(tickRef.current);
  };

  const upload = async () => {
    if (!user || chunksRef.current.length === 0) return;
    setUploading(true);
    try {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      const path = `${user.id}/clips/${Date.now()}.webm`;
      const { error: upErr } = await supabase.storage.from("posts").upload(path, blob, {
        contentType: "video/webm",
        upsert: false,
      });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("posts").getPublicUrl(path);
      const { error: postErr } = await supabase.from("posts").insert({
        user_id: user.id,
        video_url: urlData.publicUrl,
        post_type: "reel",
        content: liveStreamId ? "Live highlight 🔴" : "Highlight clip",
        hashtags: ["live", "highlight"],
      });
      if (postErr) throw postErr;
      toast.success("Clip published to your reels!");
    } catch (e: any) {
      toast.error(e?.message || "Upload failed");
    } finally {
      setUploading(false);
      chunksRef.current = [];
    }
  };

  return (
    <button
      onClick={recording ? stop : start}
      disabled={uploading}
      className={`shrink-0 h-9 px-3 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 border transition-colors ${
        recording ? "bg-destructive/90 border-destructive text-foreground" : "bg-surface border-border text-gold"
      } disabled:opacity-50`}
    >
      {uploading ? (
        <><UploadCloud className="size-3.5 animate-pulse" /> Uploading…</>
      ) : recording ? (
        <><Square className="size-3.5" /> Clip {elapsed}s</>
      ) : (
        <><Scissors className="size-3.5" /> Clip</>
      )}
    </button>
  );
};

export default LiveClipRecorder;