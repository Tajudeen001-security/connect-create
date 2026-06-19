import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Radio, Eye, Coins, Send, X, MonitorUp, UserPlus, Maximize2, Minimize2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";
import { motion, AnimatePresence } from "framer-motion";
import LiveRoom, { type LiveRoomHandle, type StreamQuality } from "@/components/LiveRoom";
import LiveClipRecorder from "@/components/LiveClipRecorder";
import CoHostInvite from "@/components/CoHostInvite";
import QualitySwitcher from "@/components/QualitySwitcher";
import StructuredData from "@/components/StructuredData";

const LivePage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [streams, setStreams] = useState<any[]>([]);
  const [activeStream, setActiveStream] = useState<any>(null);
  const [chatMessage, setChatMessage] = useState("");
  const [coinAmount, setCoinAmount] = useState<number | null>(null);
  const [showCoinMenu, setShowCoinMenu] = useState(false);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [showGoLive, setShowGoLive] = useState(false);
  const [liveTitle, setLiveTitle] = useState("");
  const [myStream, setMyStream] = useState<any>(null);
  const chatChannelRef = useRef<any>(null);
  const viewerCountedRef = useRef(false);
  const liveRoomRef = useRef<LiveRoomHandle>(null);
  const [localVideoTrack, setLocalVideoTrack] = useState<MediaStreamTrack | null>(null);
  const [quality, setQuality] = useState<StreamQuality>("auto");
  const [showInvite, setShowInvite] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) await stageRef.current?.requestFullscreen();
      else await document.exitFullscreen();
    } catch (e: any) {
      toast.error("Fullscreen not supported");
    }
  };

  const coinOptions = [10, 50, 100, 500, 1000];

  useEffect(() => {
    loadStreams();
    const channel = supabase.channel("live-streams")
      .on("postgres_changes", { event: "*", schema: "public", table: "live_streams" }, () => loadStreams())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadStreams = async () => {
    const { data } = await supabase.from("live_streams").select("*").eq("is_active", true).order("viewer_count", { ascending: false });
    if (!data) return;
    const userIds = data.map(s => s.user_id);
    if (userIds.length === 0) { setStreams([]); return; }
    const { data: profiles } = await supabase.from("profiles").select("user_id, username, avatar_url, is_verified").in("user_id", userIds);
    const pMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
    setStreams(data.map(s => ({ ...s, username: pMap.get(s.user_id)?.username || "user", avatar_url: pMap.get(s.user_id)?.avatar_url, is_verified: pMap.get(s.user_id)?.is_verified })));
  };

  const goLive = async () => {
    if (!user || !liveTitle.trim()) return;
    const { data, error } = await supabase.from("live_streams").insert({ user_id: user.id, title: liveTitle.trim(), is_active: true }).select().single();
    if (error) { toast.error("Failed to go live"); return; }
    setMyStream(data);
    setActiveStream({ ...data, username: "You", avatar_url: null });
    setShowGoLive(false);
    toast.success("You're live! 🔴");
  };

  const endStream = async () => {
    if (!myStream) return;
    await supabase.from("live_streams").update({ is_active: false, ended_at: new Date().toISOString() }).eq("id", myStream.id);
    setMyStream(null); setActiveStream(null);
    toast.success("Stream ended");
  };

  const joinStream = async (stream: any) => {
    setActiveStream(stream);
    setChatMessages([
      { user: "system", text: `Welcome to ${stream.username}'s stream!`, coins: 0 },
    ]);
    if (!viewerCountedRef.current && (!user || stream.user_id !== user.id)) {
      viewerCountedRef.current = true;
      await supabase.from("live_streams").update({ viewer_count: (stream.viewer_count || 0) + 1 }).eq("id", stream.id);
    }
  };

  // Real-time chat & gift broadcast via Supabase channel
  useEffect(() => {
    if (!activeStream) return;
    const ch = supabase.channel(`live-room-${activeStream.id}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "chat" }, (payload) => {
        setChatMessages(prev => [...prev, payload.payload]);
      })
      .subscribe();
    chatChannelRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
      chatChannelRef.current = null;
      // Decrement viewer count on leave
      if (viewerCountedRef.current && activeStream && (!user || activeStream.user_id !== user.id)) {
        supabase.from("live_streams").select("viewer_count").eq("id", activeStream.id).single().then(({ data }) => {
          const next = Math.max(0, (data?.viewer_count || 1) - 1);
          supabase.from("live_streams").update({ viewer_count: next }).eq("id", activeStream.id);
        });
        viewerCountedRef.current = false;
      }
    };
  }, [activeStream?.id]);

  const sendMessage = () => {
    if (!chatMessage.trim()) return;
    const msg = { user: "you", displayName: user?.email?.split("@")[0] || "viewer", text: chatMessage, coins: coinAmount || 0 };
    setChatMessages(prev => [...prev, msg]);
    chatChannelRef.current?.send({ type: "broadcast", event: "chat", payload: { ...msg, user: msg.displayName } });
    // If sending coins, create a gift
    if (coinAmount && activeStream && user && activeStream.user_id !== user.id) {
      supabase.from("gifts").insert({
        sender_id: user.id, recipient_id: activeStream.user_id, live_stream_id: activeStream.id,
        coin_amount: coinAmount, gift_type: "live",
      }).then(({ error }) => {
        if (error) toast.error(error.message);
        else toast.success(`🎁 Sent ${coinAmount} coins!`);
      });
    }
    setChatMessage(""); setCoinAmount(null);
  };

  if (activeStream) {
    const isPublisher = !!(myStream && myStream.id === activeStream.id);
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <div ref={stageRef} className={`relative bg-surface ${isFullscreen ? "h-full w-full" : "aspect-video"}`}>
          <LiveRoom
            ref={liveRoomRef}
            roomName={`stream-${activeStream.id}`}
            role={isPublisher ? "publisher" : "viewer"}
            identity={user?.id || `guest-${Math.random().toString(36).slice(2, 9)}`}
            displayName={user?.email?.split("@")[0] || "viewer"}
            quality={quality}
            onLocalVideoTrack={setLocalVideoTrack}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-background/40 pointer-events-none" />
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-3">
            <button onClick={() => { setActiveStream(null); if (myStream) endStream(); }} className="text-foreground"><ArrowLeft className="size-5" /></button>
            <div className="flex items-center gap-2">
              <div className="px-2 py-1 rounded-full bg-destructive/90 flex items-center gap-1.5">
                <div className="size-1.5 rounded-full bg-foreground animate-pulse" />
                <span className="text-[10px] font-bold text-foreground uppercase">Live</span>
              </div>
              <div className="px-2 py-1 rounded-full glass flex items-center gap-1.5">
                <Eye className="size-3" /><span className="text-[10px] font-bold">{activeStream.viewer_count || 0}</span>
              </div>
              {!isPublisher && <QualitySwitcher value={quality} onChange={setQuality} />}
              <button onClick={toggleFullscreen} className="size-7 rounded-full glass flex items-center justify-center text-foreground" aria-label="Toggle fullscreen">
                {isFullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
              </button>
            </div>
          </div>
          <div className="absolute bottom-3 left-3 flex items-center gap-2">
            {activeStream.avatar_url ? (
              <img src={activeStream.avatar_url} alt="" className="size-8 rounded-full border border-primary/30" />
            ) : (
              <div className="size-8 rounded-full gold-gradient flex items-center justify-center text-xs font-bold text-primary-foreground">{(activeStream.username || "U")[0].toUpperCase()}</div>
            )}
            <div>
              <p className="text-xs font-semibold text-champagne">{activeStream.username} {activeStream.is_verified && <span className="text-gold">✓</span>}</p>
              <p className="text-[10px] text-muted-foreground">{activeStream.title}</p>
            </div>
          </div>
          {isPublisher && (
            <div className="absolute bottom-3 right-3 flex items-center gap-2">
              <LiveClipRecorder videoTrack={localVideoTrack} liveStreamId={activeStream.id} />
              <button
                onClick={async () => { const on = await liveRoomRef.current?.toggleScreenShare(); setScreenSharing(!!on); }}
                className={`h-9 px-3 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 border ${screenSharing ? "gold-gradient border-primary text-primary-foreground" : "bg-surface border-border text-gold"}`}
              >
                <MonitorUp className="size-3.5" /> {screenSharing ? "Stop" : "Share"}
              </button>
              <button onClick={() => setShowInvite(true)} className="h-9 px-3 rounded-xl bg-surface border border-border text-gold text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5">
                <UserPlus className="size-3.5" /> Co-Host
              </button>
              <button onClick={endStream} className="h-9 px-3 rounded-lg bg-destructive text-foreground text-[10px] font-bold uppercase tracking-widest">End</button>
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {chatMessages.map((msg, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-xs font-semibold text-gold shrink-0">{msg.user}</span>
                <span className="text-xs text-foreground/80">{msg.text}</span>
                {msg.coins > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full gold-gradient text-primary-foreground font-bold shrink-0">🪙 {msg.coins}</span>}
              </div>
            ))}
          </div>

          <AnimatePresence>
            {showCoinMenu && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-border/30">
                <div className="flex items-center gap-2 p-3 overflow-x-auto no-scrollbar">
                  {coinOptions.map(amount => (
                    <button key={amount} onClick={() => { setCoinAmount(amount); setShowCoinMenu(false); }}
                      className={`shrink-0 px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${coinAmount === amount ? "gold-gradient border-primary text-primary-foreground" : "bg-surface border-border text-foreground"}`}>
                      🪙 {amount}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-2 p-3 border-t border-border/30">
            <button onClick={() => setShowCoinMenu(!showCoinMenu)}
              className={`shrink-0 size-10 rounded-xl flex items-center justify-center ${coinAmount ? "gold-gradient text-primary-foreground" : "bg-surface border border-border text-gold"}`}>
              <Coins className="size-5" />
            </button>
            {coinAmount && <span className="shrink-0 text-[10px] px-2 py-1 rounded-full gold-gradient text-primary-foreground font-bold">🪙 {coinAmount}</span>}
            <input type="text" placeholder="Say something..." value={chatMessage} onChange={e => setChatMessage(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMessage()}
              className="flex-1 px-3 py-2 rounded-xl bg-surface border border-border text-sm text-foreground placeholder:text-muted-foreground outline-none" />
            <button onClick={sendMessage} className="shrink-0 size-10 rounded-xl gold-gradient flex items-center justify-center text-primary-foreground"><Send className="size-4" /></button>
          </div>
        </div>
        {showInvite && isPublisher && (
          <CoHostInvite liveStreamId={activeStream.id} hostId={user!.id} onClose={() => setShowInvite(false)} />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      <StructuredData id="live" data={{
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Live streams on JagX Connect",
        description: "Watch creators stream live on JagX Connect — chat, send JagX Coin gifts, and join the room.",
        url: typeof window !== "undefined" ? window.location.origin + "/live" : "",
      }} />
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/30">
        <div className="flex items-center justify-between px-4 h-14">
          <h1 className="font-display italic text-xl text-gold">Live</h1>
          {user && (
            <button onClick={() => setShowGoLive(true)} className="px-4 py-1.5 rounded-lg gold-gradient text-primary-foreground text-xs font-bold uppercase tracking-widest flex items-center gap-2">
              <Radio className="size-3" /> Go Live
            </button>
          )}
        </div>
      </header>

      <div className="p-4 space-y-4">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Live Now · {streams.length} streams</p>

        {streams.length === 0 && (
          <div className="py-16 text-center">
            <Radio className="size-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground text-sm">No one is live right now. Be the first!</p>
          </div>
        )}

        {streams.map(stream => (
          <button key={stream.id} onClick={() => joinStream(stream)} className="w-full rounded-xl overflow-hidden bg-surface border border-border/30 text-left">
            <div className="relative aspect-video">
              {stream.thumbnail_url ? (
                <img src={stream.thumbnail_url} alt={stream.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-background">
                  <Radio className="size-12 text-gold animate-pulse" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-background/60 via-transparent" />
              <div className="absolute top-3 left-3 flex items-center gap-2">
                <div className="px-2 py-1 rounded-full bg-destructive/90 flex items-center gap-1.5">
                  <div className="size-1.5 rounded-full bg-foreground animate-pulse" />
                  <span className="text-[10px] font-bold text-foreground uppercase">Live</span>
                </div>
                <div className="px-2 py-1 rounded-full glass flex items-center gap-1.5">
                  <Eye className="size-3" /><span className="text-[10px] font-bold">{stream.viewer_count}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3">
              {stream.avatar_url ? (
                <img src={stream.avatar_url} alt="" className="size-9 rounded-full border border-primary/30" />
              ) : (
                <div className="size-9 rounded-full gold-gradient flex items-center justify-center text-sm font-bold text-primary-foreground">{(stream.username || "U")[0].toUpperCase()}</div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-champagne truncate">{stream.username} {stream.is_verified && <span className="text-gold">✓</span>}</p>
                <p className="text-xs text-muted-foreground truncate">{stream.title}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Go Live modal */}
      {showGoLive && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl flex items-center justify-center p-6">
          <div className="w-full max-w-sm bg-surface rounded-2xl border border-border/30 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-champagne">Go Live</h3>
              <button onClick={() => setShowGoLive(false)}><X className="size-5 text-foreground" /></button>
            </div>
            <input type="text" placeholder="Stream title..." value={liveTitle} onChange={e => setLiveTitle(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground outline-none mb-3" />
            <p className="text-[10px] text-muted-foreground mb-4">Viewers can send you JagX Coins during your stream. You earn 70% of all gifts!</p>
            <button onClick={goLive} disabled={!liveTitle.trim()} className="w-full py-3 rounded-xl gold-gradient text-primary-foreground font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
              <Radio className="size-4" /> Start Live Stream
            </button>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
};

export default LivePage;
