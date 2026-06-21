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

  const { data: insertedMessage, error } = await supabase
  .from("group_messages")
  .insert({
    group_id: groupId,
    sender_id: user.id,
    content: finalContent,
    message_type: type || "text",
  })
  .select()
  .single();

if (error) {
  toast.error(error.message || "Message failed to send");
  if (!content) setInput(msgContent);
  return;
}

if (insertedMessage) {
  setMessages((prev) => {
    if (prev.some((message) => message.id === insertedMessage.id)) {
      return prev;
    }

    return [
      ...prev,
      {
        ...insertedMessage,
        username: "You",
        avatar_url: null,
      },
    ];
  });
}
  

  const handleMedia = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const path = `${user.id}/${Date.now()}.${file.name.split(".").pop()}`;
    const { error } = await supabase.storage.from("posts").upload(path, file);
    if (error) { toast.error("Upload failed"); return; }
    const { data: { publicUrl } } = supabase.storage.from("posts").getPublicUrl(path);
    await sendMessage(publicUrl, file.type.startsWith("video") ? "video" : "image");
