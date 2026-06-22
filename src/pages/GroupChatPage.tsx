import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeft, Send, Users, Image as ImageIcon, X, Reply } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

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
  const [replyTo, setReplyTo] = useState<GroupMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (!groupId) return;
    loadGroup();
    loadMessages();
    loadMembers();

    const channel = supabase.channel(`group-${groupId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "group_messages", filter: `group_id=eq.${groupId}` },
        (payload: any) => {
          const msg = payload.new as GroupMessage;
          supabase.from("profiles").select("username, avatar_url").eq("user_id", msg.sender_id).single()
            .then(({ data }) => {
              setMessages(prev => prev.some(m => m.id === msg.id)
                ? prev
                : [...prev, { ...msg, username: data?.username || "user", avatar_url: data?.avatar_url }]);
            });
        })
      .subscribe();

    // Typing indicator broadcast channel
    const tch = supabase.channel(`group-typing-${groupId}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "typing" }, (payload: any) => {
        const { userId, username } = payload.payload || {};
        if (!userId || userId === user?.id) return;
        setTypingUsers(prev => prev.includes(username) ? prev : [...prev, username]);
        setTimeout(() => {
          setTypingUsers(prev => prev.filter(u => u !== username));
        }, 3000);
      })
      .subscribe();
    typingChannelRef.current = tch;

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(tch);
    };
  }, [groupId, user?.id]);

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
  }, [messages, firstUnreadId]);

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
    const { data: profiles } = await supabase.from("profiles")
      .select("user_id, username, avatar_url, is_verified").in("user_id", userIds);
    const pMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
    setMembers(data.map(m => ({ ...m, ...pMap.get(m.user_id) })));
  };

  const loadMessages = async () => {
    if (!groupId || !user) return;
    const { data: readRow } = await supabase
      .from("group_reads" as any)
      .select("last_read_at")
      .eq("user_id", user.id)
      .eq("group_id", groupId)
      .maybeSingle();
    const lastRead = (readRow as any)?.last_read_at || "1970-01-01T00:00:00Z";
    const { data } = await supabase.from("group_messages").select("*")
      .eq("group_id", groupId).order("created_at", { ascending: true }).limit(200);
    if (!data) return;
    const userIds = [...new Set(data.map(m => m.sender_id))];
    const { data: profiles } = await supabase.from("profiles")
      .select("user_id, username, avatar_url").in("user_id", userIds);
    const pMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
    const firstUnread = data.find((m: any) =>
      m.sender_id !== user.id && new Date(m.created_at) > new Date(lastRead));
    setFirstUnreadId(firstUnread?.id ?? null);
    setMessages(data.map(m => ({
      ...m,
      username: pMap.get(m.sender_id)?.username || "user",
      avatar_url: pMap.get(m.sender_id)?.avatar_url,
    })));
    await supabase.from("group_reads" as any).upsert(
      { user_id: user.id, group_id: groupId, last_read_at: new Date().toISOString() },
      { onConflict: "user_id,group_id" },
    );
  };

  const sendMessage = useCallback(async (override?: string, type: string = "text") => {
    if (!user || !groupId) return;
    const content = (override ?? input).trim();
    if (!content) return;
    setSending(true);
    const previousInput = input;
    if (!override) setInput("");

    const { data: inserted, error } = await supabase
      .from("group_messages")
      .insert({
        group_id: groupId,
        sender_id: user.id,
        content,
        message_type: type,
      })
      .select()
      .single();

    setSending(false);

    if (error) {
      toast.error(error.message || "Message failed to send");
      if (!override) setInput(previousInput);
      return;
    }

    if (inserted) {
      setMessages(prev => prev.some(m => m.id === inserted.id)
        ? prev
        : [...prev, { ...(inserted as any), username: "You", avatar_url: null }]);
    }
    setReplyTo(null);
  }, [user, groupId, input]);

  const handleMedia = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const path = `${user.id}/${Date.now()}.${file.name.split(".").pop()}`;
    const { error } = await supabase.storage.from("posts").upload(path, file);
    if (error) { toast.error("Upload failed"); return; }
    const { data: { publicUrl } } = supabase.storage.from("posts").getPublicUrl(path);
    await sendMessage(publicUrl, file.type.startsWith("video") ? "video" : "image");
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleTyping = (val: string) => {
    setInput(val);
    if (!typingChannelRef.current || !user) return;
    typingChannelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: { userId: user.id, username: (user as any).user_metadata?.username || "Someone" },
    });
    clearTimeout(typingTimeoutRef.current);
  };

  return (
    <div className="fixed inset-0 bg-black flex flex-col">
      <header className="flex items-center gap-3 p-4 border-b border-white/10 bg-black/80">
        <button onClick={() => navigate(-1)} className="text-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-semibold truncate">{groupInfo?.name || "Group"}</h1>
          <p className="text-xs text-white/50">{members.length} members</p>
        </div>
        <button onClick={() => setShowMembers(v => !v)} className="text-white">
          <Users className="w-5 h-5" />
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.map(m => {
          const isMe = m.sender_id === user?.id;
          return (
            <div
              key={m.id}
              data-unread-anchor={m.id === firstUnreadId ? "true" : undefined}
              className={`flex ${isMe ? "justify-end" : "justify-start"}`}
            >
              <div className={`max-w-[75%] rounded-2xl px-3 py-2 ${isMe ? "bg-amber-500 text-black" : "bg-white/10 text-white"}`}>
                {!isMe && <div className="text-[11px] opacity-70 mb-0.5">{m.username}</div>}
                {m.message_type === "image" ? (
                  <img src={m.content} alt="" className="rounded-lg max-w-full" />
                ) : m.message_type === "video" ? (
                  <video src={m.content} controls className="rounded-lg max-w-full" />
                ) : (
                  <div className="whitespace-pre-wrap break-words text-sm">{m.content}</div>
                )}
                <button onClick={() => setReplyTo(m)} className="text-[10px] opacity-60 mt-1 flex items-center gap-1">
                  <Reply className="w-3 h-3" /> Reply
                </button>
              </div>
            </div>
          );
        })}
        {typingUsers.length > 0 && (
          <div className="text-xs text-white/50 italic px-2">
            {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing…
          </div>
        )}
      </div>

      {replyTo && (
        <div className="px-3 py-2 bg-white/5 border-t border-white/10 flex items-center justify-between">
          <div className="text-xs text-white/70 truncate">Replying to: {replyTo.content.slice(0, 60)}</div>
          <button onClick={() => setReplyTo(null)} className="text-white/60">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="p-3 border-t border-white/10 flex items-center gap-2 bg-black">
        <button onClick={() => fileRef.current?.click()} className="text-white/70">
          <ImageIcon className="w-5 h-5" />
        </button>
        <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleMedia} />
        <input
          value={input}
          onChange={(e) => handleTyping(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          placeholder="Message…"
          className="flex-1 bg-white/10 text-white rounded-full px-4 py-2 text-sm outline-none"
        />
        <button
          onClick={() => sendMessage()}
          disabled={sending || !input.trim()}
          className="w-10 h-10 rounded-full bg-amber-500 text-black flex items-center justify-center disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>

      {showMembers && (
        <div className="absolute right-0 top-16 bg-zinc-900 border border-white/10 rounded-lg p-3 w-64 max-h-96 overflow-y-auto">
          <h3 className="text-white font-semibold mb-2">Members</h3>
          {members.map(m => (
            <div key={m.user_id} className="flex items-center gap-2 py-1.5">
              <div className="w-8 h-8 rounded-full bg-amber-500/30 overflow-hidden">
                {m.avatar_url && <img src={m.avatar_url} alt="" className="w-full h-full object-cover" />}
              </div>
              <span className="text-white text-sm">{m.username}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default GroupChatPage;
