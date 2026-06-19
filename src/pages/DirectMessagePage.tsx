import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowLeft, Send, Phone, Video, MoreVertical, Image, Trash2, Edit3, X, Check, Camera, Mic, MicOff, Download, Reply, Smile, Palette } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import VideoCall from "@/components/VideoCall";
import { parseAiTrigger, runAiText, generateAndStoreImage, AI_DISPLAY_NAME } from "@/services/chatAi";

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  message_type: string;
  is_read: boolean;
  created_at: string;
}

interface UserProfile {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
}

interface Presence {
  is_online: boolean;
  last_seen: string;
  is_typing: boolean;
}

const STICKERS = ["🐆", "🔥", "💎", "👑", "💰", "🎉", "❤️", "😂", "😍", "🙏", "💪", "🎯", "⭐", "🌟", "💫", "🤑", "😎", "🥳", "💜", "🖤"];

const DirectMessagePage = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [firstUnreadId, setFirstUnreadId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [otherUser, setOtherUser] = useState<UserProfile | null>(null);
  const [presence, setPresence] = useState<Presence | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [selectedMsg, setSelectedMsg] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [fullImage, setFullImage] = useState<string | null>(null);
  const [showStickers, setShowStickers] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [touchStart, setTouchStart] = useState<{ x: number; id: string } | null>(null);
  const [activeCall, setActiveCall] = useState<{ type: "video" | "audio"; isIncoming?: boolean } | null>(null);
  const [showTheme, setShowTheme] = useState(false);
  const [theme, setTheme] = useState<{ theme_color: string | null; background_url: string | null } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const aiInFlight = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeout = useRef<NodeJS.Timeout>();
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);

  useEffect(() => {
    if (!userId) return;
    supabase.from("profiles").select("user_id, username, display_name, avatar_url, is_verified").eq("user_id", userId).single()
      .then(({ data }) => { if (data) setOtherUser(data); });
  }, [userId]);

  // Load per-conversation theme
  useEffect(() => {
    if (!user || !userId) return;
    supabase.from("chat_themes" as any).select("theme_color, background_url").eq("user_id", user.id).eq("peer_id", userId).maybeSingle()
      .then(({ data }: any) => { if (data) setTheme(data); });
  }, [user, userId]);

  const THEME_COLORS = [
    { name: "Gold (default)", value: null },
    { name: "Royal Blue", value: "#1E3A8A" },
    { name: "Emerald", value: "#047857" },
    { name: "Crimson", value: "#9F1239" },
    { name: "Purple", value: "#6D28D9" },
    { name: "Slate", value: "#334155" },
  ];

  const saveTheme = async (color: string | null, bgUrl?: string | null) => {
    if (!user || !userId) return;
    const payload: any = { user_id: user.id, peer_id: userId, theme_color: color, updated_at: new Date().toISOString() };
    if (bgUrl !== undefined) payload.background_url = bgUrl;
    const { error } = await supabase.from("chat_themes" as any).upsert(payload, { onConflict: "user_id,peer_id" });
    if (error) { toast.error("Failed to save theme"); return; }
    setTheme({ theme_color: color, background_url: bgUrl !== undefined ? bgUrl : (theme?.background_url ?? null) });
    toast.success("Theme updated");
  };

  const themeBgRef = useRef<HTMLInputElement>(null);
  const handleThemeBg = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const path = `${user.id}/theme-${Date.now()}.${file.name.split(".").pop()}`;
    const { error } = await supabase.storage.from("posts").upload(path, file);
    if (error) { toast.error("Upload failed"); return; }
    const { data: { publicUrl } } = supabase.storage.from("posts").getPublicUrl(path);
    await saveTheme(theme?.theme_color ?? null, publicUrl);
  };

  useEffect(() => {
    if (!userId) return;
    supabase.from("user_presence").select("is_online, last_seen, is_typing").eq("user_id", userId).single()
      .then(({ data }) => { if (data) setPresence(data); });

    const channel = supabase.channel(`presence-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_presence", filter: `user_id=eq.${userId}` },
        (payload: any) => {
          if (payload.new) setPresence({ is_online: payload.new.is_online, last_seen: payload.new.last_seen, is_typing: payload.new.is_typing });
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  useEffect(() => {
    if (!user || !userId) return;
    const loadMessages = async () => {
      const { data } = await supabase.from("messages").select("*")
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${user.id})`)
        .order("created_at", { ascending: true });
      if (data) {
        // First unread message FROM the other user — used for the divider
        // and to scroll to it on initial open.
        const firstUnread = data.find((m: any) => m.sender_id === userId && !m.is_read);
        setFirstUnreadId(firstUnread?.id ?? null);
        setMessages(data);
      }
      await supabase.from("messages").update({ is_read: true }).eq("sender_id", userId).eq("receiver_id", user.id).eq("is_read", false);
    };
    loadMessages();

    const channel = supabase.channel(`dm-${user.id}-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" },
        (payload: any) => {
          if (payload.eventType === "INSERT") {
            const msg = payload.new as Message;
            if ((msg.sender_id === user.id && msg.receiver_id === userId) || (msg.sender_id === userId && msg.receiver_id === user.id)) {
              setMessages(prev => [...prev, msg]);
              if (msg.sender_id === userId) supabase.from("messages").update({ is_read: true }).eq("id", msg.id);
            }
          } else if (payload.eventType === "UPDATE") {
            setMessages(prev => prev.map(m => m.id === payload.new.id ? { ...m, ...payload.new } : m));
          } else if (payload.eventType === "DELETE") {
            setMessages(prev => prev.filter(m => m.id !== payload.old.id));
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, userId]);

  const didInitialScroll = useRef(false);
  useEffect(() => {
    if (!scrollRef.current) return;
    // First paint: jump to the first unread divider if there is one,
    // otherwise snap to the bottom. After that, smooth-scroll on new messages.
    if (!didInitialScroll.current && firstUnreadId) {
      const el = scrollRef.current.querySelector<HTMLElement>(`[data-unread-anchor="true"]`);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "auto" });
        if (messages.length > 0) didInitialScroll.current = true;
        return;
      }
    }
    scrollRef.current.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: didInitialScroll.current ? "smooth" : "auto",
    });
    if (messages.length > 0) didInitialScroll.current = true;
  }, [messages]);

  const handleTyping = useCallback(() => {
    if (!user) return;
    supabase.from("user_presence").upsert({ user_id: user.id, is_typing: true, typing_to: userId, is_online: true, last_seen: new Date().toISOString() }, { onConflict: "user_id" });
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      supabase.from("user_presence").upsert({ user_id: user.id, is_typing: false, typing_to: null, is_online: true, last_seen: new Date().toISOString() }, { onConflict: "user_id" });
    }, 2000);
  }, [user, userId]);

  const sendMessage = async (content?: string, type?: string) => {
    const msgContent = content || input.trim();
    if (!msgContent || !user || !userId) return;
    if (!content) setInput("");
    
    let finalContent = msgContent;
    if (replyTo) {
      const replyPreview = replyTo.content.length > 50 ? replyTo.content.slice(0, 50) + "..." : replyTo.content;
      finalContent = `┃ ${replyTo.sender_id === user.id ? "You" : otherUser?.username || "User"}: ${replyPreview}\n\n${msgContent}`;
      setReplyTo(null);
    }
    
    const { error } = await supabase.from("messages").insert({ sender_id: user.id, receiver_id: userId, content: finalContent, message_type: type || "text" });
    if (error) toast.error("Failed to send message");
    supabase.from("user_presence").upsert({ user_id: user.id, is_typing: false, typing_to: null, is_online: true, last_seen: new Date().toISOString() }, { onConflict: "user_id" });
    // After the user's message lands, check for an AI trigger and respond as ourselves
    // (the only way to keep replies inside a 1:1 DM). Replies are tagged with an "🤖 JagX AI:" prefix.
    if (!content) {
      const trig = parseAiTrigger(msgContent);
      if (trig && !aiInFlight.current) {
        aiInFlight.current = true;
        setAiBusy(true);
        try {
          if (trig.kind === "image") {
            const url = await generateAndStoreImage(trig.prompt, user.id);
            await supabase.from("messages").insert({ sender_id: user.id, receiver_id: userId, content: url, message_type: "image" });
            await supabase.from("messages").insert({ sender_id: user.id, receiver_id: userId, content: `🤖 ${AI_DISPLAY_NAME}: generated for "${trig.prompt}"`, message_type: "text" });
          } else {
            const history = messages.slice(-6).map(m => ({ role: m.sender_id === user.id ? "user" as const : "model" as const, text: m.content }));
            const reply = await runAiText(trig.prompt, history);
            await supabase.from("messages").insert({ sender_id: user.id, receiver_id: userId, content: `🤖 ${AI_DISPLAY_NAME}: ${reply}`, message_type: "text" });
          }
        } catch (e: any) {
          toast.error(e?.message || "AI request failed");
        } finally {
          aiInFlight.current = false;
          setAiBusy(false);
        }
      }
    }
  };

  const handleMediaSend = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const ext = file.name.split(".").pop();
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("posts").upload(path, file);
    if (uploadError) { toast.error("Upload failed"); return; }
    const { data: { publicUrl } } = supabase.storage.from("posts").getPublicUrl(path);
    const type = file.type.startsWith("video") ? "video" : "image";
    await sendMessage(publicUrl, type);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunks.current = [];
      recorder.ondataavailable = (e) => audioChunks.current.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(audioChunks.current, { type: "audio/webm" });
        stream.getTracks().forEach(t => t.stop());
        if (!user) return;
        const path = `${user.id}/${Date.now()}.webm`;
        const { error } = await supabase.storage.from("posts").upload(path, blob);
        if (error) { toast.error("Upload failed"); return; }
        const { data: { publicUrl } } = supabase.storage.from("posts").getPublicUrl(path);
        await sendMessage(publicUrl, "audio");
      };
      recorder.start();
      mediaRecorder.current = recorder;
      setIsRecording(true);
    } catch {
      toast.error("Microphone access denied");
    }
  };

  const stopRecording = () => {
    mediaRecorder.current?.stop();
    setIsRecording(false);
  };

  const deleteMessage = async (msgId: string) => {
    await supabase.from("messages").delete().eq("id", msgId).eq("sender_id", user!.id);
    setMessages(prev => prev.filter(m => m.id !== msgId));
    setSelectedMsg(null);
  };

  const startEdit = (msg: Message) => {
    setEditingId(msg.id);
    setEditText(msg.content);
    setSelectedMsg(null);
  };

  const saveEdit = async () => {
    if (!editingId || !editText.trim()) return;
    await supabase.from("messages").update({ content: editText.trim() }).eq("id", editingId).eq("sender_id", user!.id);
    setMessages(prev => prev.map(m => m.id === editingId ? { ...m, content: editText.trim() } : m));
    setEditingId(null);
  };

  const blockUser = async () => {
    if (!user || !userId) return;
    const { error } = await supabase.from("blocked_users").insert({ blocker_id: user.id, blocked_id: userId });
    if (error) toast.error("Failed to block");
    else { toast.success("User blocked"); navigate("/chat"); }
  };

  const handleTouchStart = (e: React.TouchEvent, msg: Message) => {
    setTouchStart({ x: e.touches[0].clientX, id: msg.id });
  };

  const handleTouchEnd = (e: React.TouchEvent, msg: Message) => {
    if (!touchStart || touchStart.id !== msg.id) return;
    const diff = e.changedTouches[0].clientX - touchStart.x;
    if (Math.abs(diff) > 60) {
      setReplyTo(msg);
    }
    setTouchStart(null);
  };

  const saveImage = (url: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = "image.jpg";
    a.target = "_blank";
    a.click();
  };

  const formatLastSeen = (date: string) => {
    const d = new Date(date);
    const diff = Math.floor((Date.now() - d.getTime()) / 60000);
    if (diff < 1) return "Just now";
    if (diff < 60) return `${diff}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return d.toLocaleDateString();
  };

  const getStatusText = () => {
    if (presence?.is_typing) return "typing...";
    if (presence?.is_online) return "Online";
    if (presence?.last_seen) return `Last seen ${formatLastSeen(presence.last_seen)}`;
    return "Offline";
  };

  const renderMessage = (msg: Message) => {
    const isMine = msg.sender_id === user?.id;
    const isEditing = editingId === msg.id;
    const isImage = msg.message_type === "image";
    const isVideo = msg.message_type === "video";
    const isAudio = msg.message_type === "audio";
    const isSticker = msg.message_type === "sticker";
    const isForwardedPost = msg.content.startsWith("https://") && msg.content.includes("/posts/");

    // Parse reply
    const hasReply = msg.content.startsWith("┃ ");
    let replyText = "";
    let actualContent = msg.content;
    if (hasReply && msg.message_type === "text") {
      const parts = msg.content.split("\n\n");
      replyText = parts[0];
      actualContent = parts.slice(1).join("\n\n");
    }

    if (isEditing) {
      return (
        <div className="flex items-center gap-2 max-w-[80%]">
          <input value={editText} onChange={e => setEditText(e.target.value)} onKeyDown={e => e.key === "Enter" && saveEdit()}
            className="flex-1 px-3 py-2 rounded-xl bg-surface border border-gold text-sm text-foreground outline-none" />
          <button onClick={saveEdit} className="text-gold"><Check className="size-4" /></button>
          <button onClick={() => setEditingId(null)} className="text-muted-foreground"><X className="size-4" /></button>
        </div>
      );
    }

    return (
      <div
        className="relative group"
        onTouchStart={(e) => handleTouchStart(e, msg)}
        onTouchEnd={(e) => handleTouchEnd(e, msg)}
        onClick={() => isMine && setSelectedMsg(selectedMsg === msg.id ? null : msg.id)}
      >
        <div
          className={`relative max-w-[78%] text-sm shadow-sm ${
            isSticker ? "bg-transparent text-4xl p-2" :
            isMine
              ? `text-primary-foreground rounded-2xl rounded-br-sm ${theme?.theme_color ? "" : "gold-gradient"}`
              : "bg-surface border border-border/30 text-foreground rounded-2xl rounded-bl-sm"
          } ${(isImage || isVideo) ? "p-1" : isSticker ? "" : "px-3.5 py-2"}`}
          style={
            isMine && !isSticker && theme?.theme_color
              ? { background: theme.theme_color }
              : undefined
          }
        >
          {/* Reply preview */}
          {hasReply && !isSticker && (
            <div className={`text-[10px] mb-1.5 pl-2 border-l-2 ${isMine ? "border-primary-foreground/40 text-primary-foreground/70" : "border-gold/40 text-gold/70"}`}>
              {replyText.replace("┃ ", "")}
            </div>
          )}

          {isSticker ? (
            <span className="text-4xl">{msg.content}</span>
          ) : isImage ? (
            <button onClick={(e) => { e.stopPropagation(); setFullImage(msg.content); }}>
              <img src={msg.content} className="max-w-[250px] rounded-xl" loading="lazy" />
            </button>
          ) : isVideo ? (
            <video src={msg.content} className="max-w-[250px] rounded-xl" controls playsInline preload="metadata" />
          ) : isAudio ? (
            <audio src={msg.content} controls className="max-w-[220px]" />
          ) : (
            <span>{hasReply ? actualContent : msg.content}</span>
          )}

          {!isSticker && (
            <div className={`text-[9px] mt-1 ${(isImage || isVideo) ? "px-2 pb-1" : ""} ${isMine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
              {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              {isMine && <span className="ml-1">{msg.is_read ? "✓✓" : "✓"}</span>}
            </div>
          )}
        </div>

        {selectedMsg === msg.id && isMine && (
          <div className="absolute bottom-full mb-1 right-0 flex gap-1 bg-surface border border-border/30 rounded-lg p-1 shadow-xl z-10">
            <button onClick={() => setReplyTo(msg)} className="p-1.5 rounded hover:bg-surface-elevated"><Reply className="size-3 text-foreground" /></button>
            {msg.message_type === "text" && (
              <button onClick={() => startEdit(msg)} className="p-1.5 rounded hover:bg-surface-elevated"><Edit3 className="size-3 text-foreground" /></button>
            )}
            <button onClick={() => deleteMessage(msg.id)} className="p-1.5 rounded hover:bg-surface-elevated"><Trash2 className="size-3 text-red-400" /></button>
          </div>
        )}

        {/* Reply action for other user's messages */}
        {!isMine && selectedMsg === msg.id && (
          <div className="absolute bottom-full mb-1 left-0 flex gap-1 bg-surface border border-border/30 rounded-lg p-1 shadow-xl z-10">
            <button onClick={() => { setReplyTo(msg); setSelectedMsg(null); }} className="p-1.5 rounded hover:bg-surface-elevated"><Reply className="size-3 text-foreground" /></button>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {activeCall && userId && (
        <VideoCall
          remoteUserId={userId}
          remoteUserName={otherUser?.display_name || otherUser?.username || "User"}
          remoteUserAvatar={otherUser?.avatar_url}
          callType={activeCall.type}
          isIncoming={activeCall.isIncoming}
          onEnd={() => setActiveCall(null)}
        />
      )}
    <div className="h-[100dvh] flex flex-col bg-background overflow-hidden">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/30">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/chat")} className="text-foreground"><ArrowLeft className="size-5" /></button>
            <button onClick={() => navigate(`/user/${userId}`)} className="flex items-center gap-3">
              <div className="relative">
                <div className="size-9 rounded-full bg-surface border border-border overflow-hidden">
                  {otherUser?.avatar_url ? <img src={otherUser.avatar_url} className="w-full h-full object-cover" /> :
                    <div className="w-full h-full flex items-center justify-center text-gold font-display italic text-sm">
                      {(otherUser?.username || "U")[0].toUpperCase()}
                    </div>}
                </div>
                {presence?.is_online && <div className="absolute bottom-0 right-0 size-2.5 rounded-full bg-green-500 border-2 border-background" />}
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <span className="text-sm font-semibold text-champagne">{otherUser?.display_name || otherUser?.username || "User"}</span>
                  {otherUser?.is_verified && <span className="text-gold text-xs">✓</span>}
                </div>
                <p className={`text-[10px] ${presence?.is_typing ? "text-gold" : "text-muted-foreground"}`}>{getStatusText()}</p>
              </div>
            </button>
          </div>
          <div className="flex items-center gap-3 relative">
            <button onClick={() => setActiveCall({ type: "audio" })} className="text-foreground"><Phone className="size-4" /></button>
            <button onClick={() => setActiveCall({ type: "video" })} className="text-foreground"><Video className="size-4" /></button>
            <button onClick={() => setShowTheme(true)} className="text-foreground" aria-label="Theme"><Palette className="size-4" /></button>
            <button onClick={() => setShowMenu(!showMenu)} className="text-foreground"><MoreVertical className="size-4" /></button>
            {showMenu && (
              <div className="absolute top-full right-0 mt-2 w-48 rounded-xl bg-surface border border-border/30 shadow-xl overflow-hidden z-50">
                <button onClick={() => navigate(`/user/${userId}`)} className="w-full px-4 py-3 text-left text-sm text-foreground hover:bg-surface-elevated">View Profile</button>
                <button onClick={blockUser} className="w-full px-4 py-3 text-left text-sm text-red-400 hover:bg-surface-elevated">Block User</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-1.5 pb-28"
        style={
          theme?.background_url
            ? { backgroundImage: `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url(${theme.background_url})`, backgroundSize: "cover", backgroundPosition: "center" }
            : undefined
        }
      >
        {messages.map((msg) => (
          <div key={msg.id}>
            {firstUnreadId === msg.id && (
              <div data-unread-anchor="true" className="flex items-center gap-3 my-3 px-2">
                <div className="flex-1 h-[1px] bg-gold/30" />
                <span className="text-[10px] uppercase tracking-[0.3em] text-gold/80 font-bold">Unread messages</span>
                <div className="flex-1 h-[1px] bg-gold/30" />
              </div>
            )}
            <div
              className={`flex ${msg.sender_id === user?.id ? "justify-end" : "justify-start"}`}
              onClick={() => msg.sender_id !== user?.id && setSelectedMsg(selectedMsg === msg.id ? null : msg.id)}
            >
              {renderMessage(msg)}
            </div>
          </div>
        ))}
        {(presence?.is_typing || aiBusy) && (
          <div className="flex justify-start">
            <div className="px-4 py-3 rounded-2xl bg-surface border border-border/30 rounded-bl-md">
              {aiBusy && <p className="text-[10px] text-gold mb-1 font-semibold">JagX AI is thinking…</p>}
              <div className="flex gap-1">
                <div className="size-2 rounded-full bg-gold animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="size-2 rounded-full bg-gold animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="size-2 rounded-full bg-gold animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Reply bar */}
      {replyTo && (
        <div className="fixed bottom-16 left-0 right-0 px-3 py-2 bg-surface/90 backdrop-blur border-t border-border/30 flex items-center gap-2">
          <div className="flex-1 text-xs text-muted-foreground border-l-2 border-gold pl-2 line-clamp-1">
            Replying to <span className="text-gold">{replyTo.sender_id === user?.id ? "yourself" : otherUser?.username}</span>: {replyTo.content.slice(0, 60)}
          </div>
          <button onClick={() => setReplyTo(null)}><X className="size-4 text-muted-foreground" /></button>
        </div>
      )}

      {/* Stickers */}
      {showStickers && (
        <div className="fixed bottom-16 left-0 right-0 p-3 bg-surface border-t border-border/30 grid grid-cols-10 gap-2 max-h-32 overflow-y-auto">
          {STICKERS.map(s => (
            <button key={s} onClick={() => { sendMessage(s, "sticker"); setShowStickers(false); }} className="text-2xl hover:scale-125 transition-transform">{s}</button>
          ))}
        </div>
      )}

      {/* Full image viewer */}
      {fullImage && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center" onClick={() => setFullImage(null)}>
          <div className="absolute top-4 right-4 flex gap-3 z-10">
            <button onClick={(e) => { e.stopPropagation(); saveImage(fullImage); }} className="p-2 rounded-full bg-white/10"><Download className="size-5 text-white" /></button>
            <button onClick={() => setFullImage(null)} className="p-2 rounded-full bg-white/10"><X className="size-5 text-white" /></button>
          </div>
          <img src={fullImage} className="max-w-full max-h-[85vh] object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {showTheme && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end" onClick={() => setShowTheme(false)}>
          <div className="w-full bg-background border-t border-border/30 rounded-t-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-champagne">Chat theme</h3>
              <button onClick={() => setShowTheme(false)}><X className="size-5 text-foreground" /></button>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Bubble color</p>
              <div className="grid grid-cols-3 gap-2">
                {THEME_COLORS.map((c) => (
                  <button
                    key={c.name}
                    onClick={() => saveTheme(c.value)}
                    className={`px-3 py-3 rounded-xl text-xs font-medium border ${theme?.theme_color === c.value || (!theme?.theme_color && c.value === null) ? "border-gold" : "border-border/30"}`}
                    style={c.value ? { background: c.value, color: "#fff" } : undefined}
                  >
                    {c.value ? c.name : "Gold"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Background image</p>
              <div className="flex gap-2">
                <button onClick={() => themeBgRef.current?.click()} className="flex-1 px-3 py-3 rounded-xl gold-gradient text-primary-foreground text-xs font-bold">
                  Upload photo
                </button>
                {theme?.background_url && (
                  <button onClick={() => saveTheme(theme.theme_color ?? null, null)} className="px-3 py-3 rounded-xl bg-surface border border-border/30 text-xs">
                    Remove
                  </button>
                )}
              </div>
              <input ref={themeBgRef} type="file" accept="image/*" className="hidden" onChange={handleThemeBg} />
              <p className="text-[10px] text-muted-foreground mt-2">Theme only applies to this chat, only for you.</p>
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 p-3 bg-background/80 backdrop-blur-xl border-t border-border/30">
        <div className="flex items-center gap-2">
          <button onClick={() => fileRef.current?.click()} className="text-muted-foreground shrink-0"><Image className="size-5" /></button>
          <input ref={fileRef} type="file" accept="image/*,video/*" onChange={handleMediaSend} className="hidden" />
          <button onClick={() => setShowStickers(!showStickers)} className="text-muted-foreground shrink-0"><Smile className="size-5" /></button>
          <input
            type="text"
            placeholder="Message • try @JagxAI or /imagine …"
            value={input}
            onChange={(e) => { setInput(e.target.value); handleTyping(); }}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            className="flex-1 px-4 py-3 rounded-xl bg-surface border border-border text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          {input.trim() ? (
            <button onClick={() => sendMessage()} disabled={aiBusy} className="size-11 rounded-xl gold-gradient flex items-center justify-center text-primary-foreground shrink-0 disabled:opacity-50">
              <Send className="size-4" />
            </button>
          ) : (
            <button
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onTouchStart={startRecording}
              onTouchEnd={stopRecording}
              className={`size-11 rounded-xl flex items-center justify-center shrink-0 ${isRecording ? "bg-red-500" : "gold-gradient"} text-primary-foreground`}
            >
              {isRecording ? <MicOff className="size-4" /> : <Mic className="size-4" />}
            </button>
          )}
        </div>
      </div>
    </div>
    </>
  );
};

export default DirectMessagePage;
