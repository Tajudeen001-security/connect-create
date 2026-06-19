import { useEffect, useState } from "react";
import { ArrowLeft, Key, Plus, Copy, Trash2, ShieldAlert, Code2, BookOpen, Coins } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  last_used_at: string | null;
  usage_count: number;
  revoked: boolean;
  created_at: string;
}

const API_BASE = "https://tmmeymhaxkrvngjfhave.supabase.co/functions/v1/ai-v1-chat";

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randomKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `jagx_live_${b64}`;
}

const DeveloperPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [coins, setCoins] = useState<number>(0);

  useEffect(() => {
    if (user) {
      load();
      supabase.from("profiles").select("jagx_coins").eq("user_id", user.id).single()
        .then(({ data }) => setCoins((data as any)?.jagx_coins ?? 0));
    }
  }, [user]);

  const load = async () => {
    const { data } = await supabase.from("api_keys").select("*").order("created_at", { ascending: false });
    setKeys((data as ApiKey[]) || []);
  };

  const createKey = async () => {
    if (!user) return;
    if (!name.trim()) { toast.error("Give your key a name"); return; }
    setCreating(true);
    try {
      const rawKey = randomKey();
      const key_hash = await sha256Hex(rawKey);
      const key_prefix = rawKey.slice(0, 16);
      const { error } = await (supabase.rpc as any)("purchase_api_key", {
        _name: name.trim(),
        _key_prefix: key_prefix,
        _key_hash: key_hash,
      });
      if (error) throw error;
      setRevealedKey(rawKey);
      setName("");
      await load();
      toast.success("API key created — copy it now, you won't see it again!");
    } catch (e: any) {
      toast.error(e.message || "Failed to create key");
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (id: string) => {
    const { error } = await supabase.from("api_keys").update({ revoked: true }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Key revoked");
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("api_keys").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Key deleted");
    load();
  };

  const copy = (s: string) => { navigator.clipboard.writeText(s); toast.success("Copied"); };

  return (
    <div className="min-h-screen pb-24 bg-background">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/30">
        <div className="flex items-center gap-3 px-4 h-14">
          <button onClick={() => navigate(-1)} className="text-foreground"><ArrowLeft className="size-5" /></button>
          <Code2 className="size-5 text-gold" />
          <h1 className="font-display italic text-xl text-gold">Developer API</h1>
          <div className="ml-auto flex items-center gap-1 text-xs text-gold"><Coins className="size-3.5" /> {coins}</div>
        </div>
      </header>

      <div className="p-4 space-y-5">
        <div className="p-4 rounded-xl glass gold-glow">
          <h2 className="text-sm font-semibold text-champagne mb-1">Build your own AI with JagX · Free</h2>
          <p className="text-xs text-muted-foreground">
            Get a personal API key and call our OpenAI-compatible <code className="text-gold">/v1/chat/completions</code> endpoint
            powered by the latest Gemini & GPT models. Build chatbots, assistants, agents — whatever you can imagine.
          </p>
          <button onClick={() => navigate("/developer/docs")} className="mt-3 inline-flex items-center gap-1.5 text-xs text-gold underline">
            <BookOpen className="size-3.5" /> Full API documentation →
          </button>
        </div>

        {revealedKey && (
          <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
            <div className="flex items-start gap-2 mb-2">
              <ShieldAlert className="size-4 text-yellow-400 mt-0.5 shrink-0" />
              <p className="text-xs text-yellow-200">Copy this key now. For security, you won't be able to see it again.</p>
            </div>
            <div className="flex items-center gap-2 p-2 rounded-lg bg-background/60 border border-border/30">
              <code className="flex-1 text-[11px] font-mono text-foreground break-all">{revealedKey}</code>
              <button onClick={() => copy(revealedKey)} className="text-gold"><Copy className="size-4" /></button>
            </div>
            <button onClick={() => setRevealedKey(null)} className="mt-3 text-xs text-muted-foreground underline">I've saved it</button>
          </div>
        )}

        <div className="p-4 rounded-xl bg-surface border border-border/30 space-y-3">
          <h3 className="text-sm font-semibold text-champagne flex items-center gap-2"><Key className="size-4" /> Create new key · Free</h3>
          <div className="flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Key name (e.g. My Chatbot)"
              className="flex-1 px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground outline-none" />
            <button onClick={createKey} disabled={creating} className="px-3 py-2 rounded-xl gold-gradient text-primary-foreground text-xs font-bold uppercase tracking-widest flex items-center gap-1 disabled:opacity-50">
              <Plus className="size-3.5" /> Create
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground">API keys are currently free for everyone — create as many as you need.</p>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-champagne">Your keys</h3>
          {keys.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No keys yet — create one above to get started.</p>
          ) : (
            keys.map((k) => (
              <div key={k.id} className={`p-3 rounded-xl bg-surface border border-border/30 ${k.revoked ? "opacity-50" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-champagne truncate">{k.name}</p>
                    <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{k.key_prefix}…{k.revoked ? " · revoked" : ""}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Used {k.usage_count ?? 0}× · {k.last_used_at ? `last ${new Date(k.last_used_at).toLocaleDateString()}` : "never used"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {!k.revoked && (
                      <button onClick={() => revoke(k.id)} className="px-2.5 py-1.5 rounded-lg bg-background border border-border text-[10px] uppercase tracking-widest text-yellow-400 font-bold">Revoke</button>
                    )}
                    <button onClick={() => remove(k.id)} className="p-1.5 rounded-lg bg-background border border-border text-red-400"><Trash2 className="size-3.5" /></button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-4 rounded-xl bg-surface border border-border/30 space-y-3">
          <h3 className="text-sm font-semibold text-champagne flex items-center gap-2"><BookOpen className="size-4" /> Quick start</h3>
          <p className="text-xs text-muted-foreground">OpenAI-compatible. Drop-in for any SDK that supports a custom base URL.</p>
          <div className="rounded-lg bg-background/60 border border-border/30 p-3 overflow-x-auto">
            <pre className="text-[11px] text-foreground/90 leading-relaxed whitespace-pre"><code>{`curl ${API_BASE} \\
  -H "Authorization: Bearer jagx_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "google/gemini-3-flash-preview",
    "messages": [{"role":"user","content":"Hello JagX!"}]
  }'`}</code></pre>
          </div>
          <button onClick={() => navigate("/developer/docs")} className="text-xs text-gold underline">Read full documentation →</button>
        </div>
      </div>
    </div>
  );
};

export default DeveloperPage;
