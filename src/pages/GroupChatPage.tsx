import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Send, Users, Plus, Settings, Image, X, UserPlus, Reply } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { parseAiTrigger, runAiText, generateAndStoreImage, AI_DISPLAY_NAME } from "@/services/chatAi";

interface GroupMessage {
  id: string;
  group_id: string;
  sender_id: string;
  content: string;
  message_type: string;
  created_at: string;
  username?: string;
  avatar_url?: string | null;
}

const GroupChatPage = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [firstUnreadId, setFirstUnreadId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [groupInfo, setGroupInfo] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [showMembers, setShowMembers] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [searchUser, setSearchUser] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [replyTo, setReplyTo] = useState<GroupMessage | null>(null);
  const [touchStart, setTouchStart] = useState<{ x: number; id: string } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const aiInFlight = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!groupId) return;
    loadGroup();
    loadMessages();
    loadMembers();

    const channel = supabase.channel(`group-${groupId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "group_messages", filter: `group_id=eq.${groupId}` },
        (payload: any) => {
          const msg = payload.new as GroupMessage;
          // Fetch sender profile
          supabase.from("profiles").select("username, avatar_url").eq("user_id", msg.sender_id).single()
            .then(({ data }) => {
              setMessages(prev => [...prev, { ...msg, username: data?.username || "user", avatar_url: data?.avatar_url }]);
            });
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [groupId]);

  const didInitialScroll = useRef(false);
  useEffect(() => {
    if (!scrollRef.current) return;
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

  const loadGroup = async () => {
    if (!groupId) return;
    const { data } = await supabase.from("group_chats").select("*").eq("id", groupId).single();
    if (data) setGroupInfo(data);
  };

  const loadMembers = async () => {
    if (!groupId) return;
    const { data } = await supabase.from("group_members").select("*").eq("group_id", groupId);
    if (!data) return;
    const userIds = data.map(m => m.user_id);
    const { data: profiles } = await supabase.from("profiles").select("user_id, username, avatar_url, is_verified").in("user_id", userIds);
    const pMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
    setMembers(data.map(m => ({ ...m, ...pMap.get(m.user_id) })));
  };

  const loadMessages = async () => {
    if (!groupId || !user) return;
    // Find when this user last opened the group, then mark as read.
    const { data: readRow } = await supabase
      .from("group_reads" as any)
      .select("last_read_at")
      .eq("user_id", user.id)
      .eq("group_id", groupId)
      .maybeSingle();
    const lastRead = (readRow as any)?.last_read_at || "1970-01-01T00:00:00Z";
    const { data } = await supabase.from("group_messages").select("*").eq("group_id", groupId).order("created_at", { ascending: true }).limit(200);
    if (!data) return;
    const userIds = [...new Set(data.map(m => m.sender_id))];
    const { data: profiles } = await supabase.from("profiles").select("user_id, username, avatar_url").in("user_id", userIds);
    const pMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
    const firstUnread = data.find((m: any) => m.sender_id !== user.id && new Date(m.created_at) > new Date(lastRead));
    setFirstUnreadId(firstUnread?.id ?? null);
    setMessages(data.map(m => ({ ...m, username: pMap.get(m.sender_id)?.username || "user", avatar_url: pMap.get(m.sender_id)?.avatar_url })));
    // Mark this group as read for the current user
    await supabase.from("group_reads" as any).upsert(
      { user_id: user.id, group_id: groupId, last_read_at: new Date().toISOString() },
      { onConflict: "user_id,group_id" },
    );
  };

  const sendMessage = async (content?: string, type?: string) => {
    const msgContent = content || input.trim();
    if (!msgContent || !user || !groupId) return;
    if (!content) setInput("");
    let finalContent = msgContent;
    if (replyTo && (type || "text") === "text") {
      const preview = replyTo.content.length > 50 ? replyTo.content.slice(0, 50) + "..." : replyTo.content;
      finalContent = `┃ ${replyTo.username || "User"}: ${preview}\n\n${msgContent}`;
      setReplyTo(null);
    }
    await supabase.from("group_messages").insert({ group_id: groupId, sender_id: user.id, content: finalContent, message_type: type || "text" });
    if (!content) {
      const trig = parseAiTrigger(msgContent);
      if (trig && !aiInFlight.current) {
        aiInFlight.current = true;
        setAiBusy(true);
        try {
          if (trig.kind === "image") {
            const url = await generateAndStoreImage(trig.prompt, user.id);
            await supabase.from("group_messages").insert({ group_id: groupId, sender_id: user.id, content: url, message_type: "image" });
            await supabase.from("group_messages").insert({ group_id: groupId, sender_id: user.id, content: `🤖 ${AI_DISPLAY_NAME}: generated for "${trig.prompt}"`, message_type: "text" });
          } else {
            const history = messages.slice(-6).map(m => ({ role: m.sender_id === user.id ? "user" as const : "model" as const, text: m.content }));
            const reply = await runAiText(trig.prompt, history);
            await supabase.from("group_messages").insert({ group_id: groupId, sender_id: user.id, content: `🤖 ${AI_DISPLAY_NAME}: ${reply}`, message_type: "text" });
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

  const handleMedia = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const path = `${user.id}/${Date.now()}.${file.name.split(".").pop()}`;
    const { error } = await supabase.storage.from("posts").upload(path, file);
    if (error) { toast.error("Upload failed"); return; }
    const { data: { publicUrl } } = supabase.storage.from("posts").getPublicUrl(path);
    await sendMessage(publicUrl, file.type.startsWith("video") ? "video" : "image");
  };

  const searchUsers = async (q: string) => {
    setSearchUser(q);
    if (q.length < 2) { setSearchResults([]); return; }
    const { data } = await supabase.from("profiles").select("user_id, username, avatar_url").ilike("username", `%${q}%`).limit(10);
    const memberIds = new Set(members.map(m => m.user_id));
    setSearchResults((data || []).filter(p => !memberIds.has(p.user_id)));
  };

  const addMember = async (userId: string) => {
    if (!groupId) return;
    const { error } = await supabase.from("group_members").insert({ group_id: groupId, user_id: userId });
    if (error) toast.error("Failed to add member");
    else { toast.success("Member added"); loadMembers(); setSearchResults(r => r.filter(p => p.user_id !== userId)); }
  };

  const isAdmin = members.find(m => m.user_id === user?.id)?.role === "admin";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/30">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/chat")} className="text-foreground"><ArrowLeft className="size-5" /></button>
            <button onClick={() => setShowMembers(true)} className="flex items-center gap-3">
              <div className="size-9 rounded-full gold-gradient flex items-center justify-center">
                <Users className="size-4 text-primary-foreground" />
              </div>
              <div>
                <span className="text-sm font-semibold text-champagne">{groupInfo?.name || "Group"}</span>
                <p className="text-[10px] text-muted-foreground">{members.length} members · {messages.length} messages</p>
              </div>
            </button>
          </div>
          {isAdmin && (
            <button onClick={() => setShowAddMember(true)} className="text-gold"><UserPlus className="size-5" /></button>
          )}
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-3 pb-20">
        {messages.map(msg => {
          const isMine = msg.sender_id === user?.id;
          const hasReply = msg.message_type === "text" && msg.content.startsWith("┃ ");
          let replyPreview = "";
          let body = msg.content;
          if (hasReply) {
            const parts = msg.content.split("\n\n");
            replyPreview = parts[0].replace("┃ ", "");
            body = parts.slice(1).join("\n\n");
          }
          return (
            <div key={msg.id}>
              {firstUnreadId === msg.id && (
                <div data-unread-anchor="true" className="flex items-center gap-3 my-2 px-1">
                  <div className="flex-1 h-[1px] bg-gold/30" />
                  <span className="text-[10px] uppercase tracking-[0.3em] text-gold/80 font-bold">Unread messages</span>
                  <div className="flex-1 h-[1px] bg-gold/30" />
                </div>
              )}
              <div
              className={`flex ${isMine ? "justify-end" : "justify-start"}`}
              onTouchStart={(e) => setTouchStart({ x: e.touches[0].clientX, id: msg.id })}
              onTouchEnd={(e) => {
                if (!touchStart || touchStart.id !== msg.id) return;
                if (Math.abs(e.changedTouches[0].clientX - touchStart.x) > 60) setReplyTo(msg);
                setTouchStart(null);
              }}
              onDoubleClick={() => setReplyTo(msg)}
            >
              <div className={`max-w-[80%] ${isMine ? "" : "flex gap-2"}`}>
                {!isMine && (
                  <div className="size-6 rounded-full bg-surface overflow-hidden shrink-0 mt-1">
                    {msg.avatar_url ? <img src={msg.avatar_url} className="w-full h-full object-cover" /> :
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-gold font-bold">{(msg.username || "U")[0].toUpperCase()}</div>}
                  </div>
                )}
                <div>
                  {!isMine && <p className="text-[10px] text-gold font-semibold mb-0.5">{msg.username}</p>}
                  <div className={`rounded-2xl text-sm ${
                    isMine ? "gold-gradient text-primary-foreground rounded-br-md" : "bg-surface border border-border/30 text-foreground rounded-bl-md"
                  } ${msg.message_type !== "text" ? "p-1" : "px-4 py-2.5"}`}>
                    {hasReply && (
                      <div className={`text-[10px] mb-1.5 pl-2 border-l-2 ${isMine ? "border-primary-foreground/40 text-primary-foreground/80" : "border-gold/40 text-gold/80"}`}>
                        {replyPreview}
                      </div>
                    )}
                    {msg.message_type === "image" ? <img src={msg.content} className="max-w-[250px] rounded-xl" /> :
                     msg.message_type === "video" ? <video src={msg.content} className="max-w-[250px] rounded-xl" controls playsInline /> :
                     body}
                  </div>
                  <div className={`flex items-center gap-2 text-[9px] mt-0.5 ${isMine ? "justify-end" : ""} text-muted-foreground`}>
                    <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    <button onClick={() => setReplyTo(msg)} className="hover:text-gold flex items-center gap-0.5"><Reply className="size-2.5" /> reply</button>
                  </div>
                </div>
              </div>
            </div>
            </div>
          );
        })}
        {aiBusy && (
          <div className="flex justify-start">
            <div className="px-4 py-3 rounded-2xl bg-surface border border-border/30 rounded-bl-md">
              <p className="text-[10px] text-gold mb-1 font-semibold">JagX AI is thinking…</p>
              <div className="flex gap-1">
                <div className="size-2 rounded-full bg-gold animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="size-2 rounded-full bg-gold animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="size-2 rounded-full bg-gold animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Reply banner */}
      {replyTo && (
        <div className="fixed bottom-16 left-0 right-0 mx-3 p-2 rounded-xl bg-surface border border-gold/30 flex items-center gap-2 z-30">
          <div className="w-1 h-8 bg-gold rounded-full" />
          <div className="flex-1 text-xs">
            <p className="text-gold font-semibold">Replying to {replyTo.username || "User"}</p>
            <p className="text-muted-foreground truncate">{replyTo.content.slice(0, 60)}</p>
          </div>
          <button onClick={() => setReplyTo(null)} className="text-muted-foreground"><X className="size-4" /></button>
        </div>
      )}

      {/* Input */}
      <div className="fixed bottom-0 left-0 right-0 p-3 bg-background/80 backdrop-blur-xl border-t border-border/30">
        <div className="flex items-center gap-2">
          <button onClick={() => fileRef.current?.click()} className="text-muted-foreground"><Image className="size-5" /></button>
          <input ref={fileRef} type="file" accept="image/*,video/*" onChange={handleMedia} className="hidden" />
          <input type="text" placeholder="Message • try @JagxAI or /imagine …" value={input}
            onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMessage()}
            className="flex-1 px-4 py-3 rounded-xl bg-surface border border-border text-sm text-foreground placeholder:text-muted-foreground outline-none" />
          <button onClick={() => sendMessage()} disabled={!input.trim() || aiBusy} className="size-11 rounded-xl gold-gradient flex items-center justify-center text-primary-foreground disabled:opacity-50">
            <Send className="size-4" />
          </button>
        </div>
      </div>

      {/* Members panel */}
      {showMembers && (
        <div className="fixed inset-0 z-50 bg-background">
          <div className="flex items-center justify-between px-4 h-14 border-b border-border/30">
            <span className="font-semibold text-champagne">Members ({members.length})</span>
            <button onClick={() => setShowMembers(false)}><X className="size-5 text-foreground" /></button>
          </div>
          <div className="p-4 space-y-3">
            {members.map(m => (
              <div key={m.user_id} className="flex items-center gap-3">
                <div className="size-10 rounded-full bg-surface overflow-hidden border border-border">
                  {m.avatar_url ? <img src={m.avatar_url} className="w-full h-full object-cover" /> :
                    <div className="w-full h-full flex items-center justify-center text-gold font-bold">{(m.username || "U")[0].toUpperCase()}</div>}
                </div>
                <div className="flex-1">
                  <p className="text-sm text-champagne font-semibold">{m.username || "User"}</p>
                  {m.role === "admin" && <span className="text-[10px] text-gold">Admin</span>}
                </div>
                <button onClick={() => navigate(`/user/${m.user_id}`)} className="text-xs text-gold">View</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add member */}
      {showAddMember && (
        <div className="fixed inset-0 z-50 bg-background">
          <div className="flex items-center justify-between px-4 h-14 border-b border-border/30">
            <span className="font-semibold text-champagne">Add Members</span>
            <button onClick={() => setShowAddMember(false)}><X className="size-5 text-foreground" /></button>
          </div>
          <div className="p-4">
            <input type="text" placeholder="Search by username..." value={searchUser} onChange={e => searchUsers(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-surface border border-border text-sm text-foreground placeholder:text-muted-foreground outline-none mb-4" />
            {searchResults.map(p => (
              <div key={p.user_id} className="flex items-center gap-3 py-2">
                <div className="size-10 rounded-full bg-surface overflow-hidden border border-border">
                  {p.avatar_url ? <img src={p.avatar_url} className="w-full h-full object-cover" /> :
                    <div className="w-full h-full flex items-center justify-center text-gold font-bold">{(p.username || "U")[0].toUpperCase()}</div>}
                </div>
                <span className="flex-1 text-sm text-champagne">{p.username}</span>
                <button onClick={() => addMember(p.user_id)} className="px-3 py-1 rounded-lg gold-gradient text-primary-foreground text-xs font-bold">Add</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupChatPage;
