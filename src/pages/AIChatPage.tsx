import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowLeft, Send, Bot, Image, Plus, Trash2, MessageSquare, Mic, MicOff, Camera, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";

type Msg = { role: "user" | "assistant"; content: string; image_url?: string; user_image?: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;

const AIChatPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [conversations, setConversations] = useState<{ id: string; title: string; updated_at: string }[]>([]);
  const [activeConvoId, setActiveConvoId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!user) return;
    supabase.from("ai_conversations").select("id, title, updated_at").eq("user_id", user.id).order("updated_at", { ascending: false }).then(({ data }) => {
      if (data) setConversations(data);
    });
  }, [user]);

  const loadConversation = async (convoId: string) => {
    const { data } = await supabase.from("ai_messages").select("role, content, image_url").eq("conversation_id", convoId).order("created_at");
    if (data) {
      setMessages(data.map(m => ({ role: m.role as "user" | "assistant", content: m.content, image_url: m.image_url || undefined })));
    }
    setActiveConvoId(convoId);
    setShowSidebar(false);
  };

  const startNewChat = () => {
    setActiveConvoId(null);
    setMessages([{ role: "assistant", content: "Hey there! 🐆 I'm **JagX Buddy**, your AI assistant!\n\n🧮 Solve problems and do math\n📸 Send me **images** and I'll analyze them\n🎨 Ask me to **generate images** for posts\n💡 Help with ideas, writing, research, coding, business and more\n🌍 Ask me **anything** about the world!\n\nWhat can I help you with today?" }]);
    setShowSidebar(false);
  };

  const deleteConversation = async (convoId: string) => {
    await supabase.from("ai_conversations").delete().eq("id", convoId);
    setConversations(prev => prev.filter(c => c.id !== convoId));
    if (activeConvoId === convoId) startNewChat();
  };

  const saveMessage = async (convoId: string, msg: Msg) => {
    await supabase.from("ai_messages").insert({
      conversation_id: convoId,
      role: msg.role,
      content: msg.content,
      image_url: msg.image_url || msg.user_image || null,
    });
  };

  const getOrCreateConvo = async (firstMsg: string): Promise<string> => {
    if (activeConvoId) return activeConvoId;
    const title = firstMsg.slice(0, 50) + (firstMsg.length > 50 ? "..." : "");
    const { data, error } = await supabase.from("ai_conversations").insert({ user_id: user!.id, title }).select("id").single();
    if (error || !data) throw new Error("Failed to create conversation");
    const newId = data.id;
    setActiveConvoId(newId);
    setConversations(prev => [{ id: newId, title, updated_at: new Date().toISOString() }, ...prev]);
    await saveMessage(newId, { role: "assistant", content: "Hey there! 🐆 I'm **JagX Buddy**, your AI assistant!" });
    return newId;
  };

  const isImageRequest = (text: string) => {
    const keywords = ["generate image", "create image", "draw", "make a picture", "generate a picture", "create a photo", "make an image", "generate picture", "draw me", "create art", "make art", "generate art", "design an image"];
    return keywords.some(k => text.toLowerCase().includes(k));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPendingImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const streamResponse = async (resp: Response): Promise<string> => {
    if (!resp.body) throw new Error("No response body");
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let textBuffer = "";
    let assistantSoFar = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      textBuffer += decoder.decode(value, { stream: true });
      let newlineIndex: number;
      while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
        let line = textBuffer.slice(0, newlineIndex);
        textBuffer = textBuffer.slice(newlineIndex + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line.startsWith(":") || line.trim() === "") continue;
        if (!line.startsWith("data: ")) continue;
        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") break;
        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (content) {
            assistantSoFar += content;
            const current = assistantSoFar;
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant" && prev.length > 1 && prev[prev.length - 2]?.role === "user") {
                return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: current } : m));
              }
              return [...prev, { role: "assistant", content: current }];
            });
          }
        } catch {
          textBuffer = line + "\n" + textBuffer;
          break;
        }
      }
    }
    return assistantSoFar;
  };

  const send = async () => {
    const text = input.trim();
    if ((!text && !pendingImage) || isLoading || !user) return;
    
    const userMsg: Msg = { role: "user", content: text || "📷 [Image sent for analysis]", user_image: pendingImage || undefined };
    setInput("");
    const sentImage = pendingImage;
    setPendingImage(null);
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const convoId = await getOrCreateConvo(userMsg.content);
      await saveMessage(convoId, userMsg);
      const allMsgs = [...messages, userMsg].filter(m => m.role !== "assistant" || !m.image_url);

      if (sentImage) {
        // Image analysis mode
        const resp = await fetch(CHAT_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            messages: [...allMsgs.slice(0, -1).map(m => ({ role: m.role, content: m.content })), { text: text || "Analyze this image", imageUrl: sentImage }],
            imageAnalysis: true,
          }),
        });
        if (!resp.ok) throw new Error("Image analysis failed");
        const result = await streamResponse(resp);
        if (result) await saveMessage(convoId, { role: "assistant", content: result });
      } else if (isImageRequest(text)) {
        const resp = await fetch(CHAT_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ messages: allMsgs.map(m => ({ role: m.role, content: m.content })), generateImage: true }),
        });
        if (!resp.ok) throw new Error("Image generation failed");
        const data = await resp.json();
        const assistantMsg: Msg = { role: "assistant", content: data.text || "Here's your image! 🎨🐆", image_url: data.imageUrl };
        setMessages(prev => [...prev, assistantMsg]);
        await saveMessage(convoId, assistantMsg);
      } else {
        // Streaming text
        const resp = await fetch(CHAT_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ messages: allMsgs.map(m => ({ role: m.role, content: m.content })) }),
        });
        if (!resp.ok || !resp.body) throw new Error("AI request failed");
        const result = await streamResponse(resp);
        if (result) await saveMessage(convoId, { role: "assistant", content: result });
      }

      await supabase.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", convoId);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: "assistant", content: "Sorry, I'm having trouble connecting right now. Please try again! 🐆" }]);
      toast.error("AI request failed");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { startNewChat(); }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Sidebar */}
      {showSidebar && (
        <div className="fixed inset-0 z-50 flex">
          <div className="w-72 bg-background border-r border-border/30 flex flex-col h-full">
            <div className="p-4 border-b border-border/30 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-champagne">Chat History</h2>
              <button onClick={() => setShowSidebar(false)} className="text-muted-foreground"><ArrowLeft className="size-4" /></button>
            </div>
            <button onClick={startNewChat} className="m-3 py-2 px-3 rounded-lg border border-gold/30 text-gold text-xs font-semibold flex items-center gap-2">
              <Plus className="size-3" /> New Chat
            </button>
            <div className="flex-1 overflow-y-auto px-3 space-y-1">
              {conversations.map(c => (
                <div key={c.id} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer text-xs transition-colors ${activeConvoId === c.id ? "bg-surface-elevated text-champagne" : "text-muted-foreground hover:bg-surface"}`}>
                  <button onClick={() => loadConversation(c.id)} className="flex-1 text-left truncate">{c.title}</button>
                  <button onClick={(e) => { e.stopPropagation(); deleteConversation(c.id); }} className="text-muted-foreground hover:text-red-400"><Trash2 className="size-3" /></button>
                </div>
              ))}
            </div>
          </div>
          <div className="flex-1 bg-black/50" onClick={() => setShowSidebar(false)} />
        </div>
      )}

      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/30">
        <div className="flex items-center gap-3 px-4 h-14">
          <button onClick={() => navigate(-1)} className="text-foreground"><ArrowLeft className="size-5" /></button>
          <button onClick={() => setShowSidebar(true)} className="text-foreground"><MessageSquare className="size-5" /></button>
          <div className="size-8 rounded-full gold-gradient flex items-center justify-center">
            <Bot className="size-4 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <h1 className="text-sm font-semibold text-champagne">JagX Buddy</h1>
            <p className="text-[10px] text-muted-foreground">AI • Chat • Images • Ideas</p>
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-3 pb-32">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[88%] rounded-2xl text-sm ${
              msg.role === "user"
                ? "gold-gradient text-primary-foreground rounded-br-md px-4 py-2.5"
                : "bg-surface border border-border/30 text-foreground rounded-bl-md px-4 py-3"
            }`}>
              {msg.role === "assistant" ? (
                <div className="prose prose-sm prose-invert max-w-none [&_table]:text-xs [&_pre]:bg-background/50 [&_pre]:rounded-lg [&_code]:text-gold [&_.katex]:text-foreground [&_.katex-display]:overflow-x-auto [&_.katex-display]:py-2">
                  <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {msg.content}
                  </ReactMarkdown>
                  {msg.image_url && (
                    <img src={msg.image_url} alt="Generated" className="mt-2 rounded-lg max-w-full" />
                  )}
                </div>
              ) : (
                <div>
                  {msg.user_image && (
                    <img src={msg.user_image} alt="Sent" className="max-w-[200px] rounded-lg mb-2" />
                  )}
                  {msg.content !== "📷 [Image sent for analysis]" && msg.content}
                  {msg.content === "📷 [Image sent for analysis]" && <span>📷 Image sent for analysis</span>}
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <div className="flex justify-start">
            <div className="px-4 py-3 rounded-2xl bg-surface border border-border/30 rounded-bl-md">
              <div className="flex gap-1">
                <div className="size-2 rounded-full bg-gold animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="size-2 rounded-full bg-gold animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="size-2 rounded-full bg-gold animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Pending image preview */}
      {pendingImage && (
        <div className="fixed bottom-20 left-3 right-3 p-2 bg-surface border border-border/30 rounded-xl flex items-center gap-2">
          <img src={pendingImage} alt="Preview" className="size-16 rounded-lg object-cover" />
          <span className="text-xs text-muted-foreground flex-1">Image ready to send</span>
          <button onClick={() => setPendingImage(null)} className="text-muted-foreground"><X className="size-4" /></button>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 p-3 bg-background/80 backdrop-blur-xl border-t border-border/30">
        <div className="flex items-center gap-2">
          <button onClick={() => fileRef.current?.click()} className="text-muted-foreground shrink-0">
            <Camera className="size-5" />
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
          <input
            type="text"
            placeholder={pendingImage ? "Add a message about this image..." : "Ask JagX Buddy anything..."}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            className="flex-1 px-4 py-3 rounded-xl bg-surface border border-border text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          <button onClick={send} disabled={isLoading || (!input.trim() && !pendingImage)}
            className="size-11 rounded-xl gold-gradient flex items-center justify-center text-primary-foreground disabled:opacity-50 shrink-0">
            <Send className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIChatPage;
