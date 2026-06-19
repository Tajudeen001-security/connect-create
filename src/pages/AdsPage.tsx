import { ArrowLeft, Plus, Eye, Coins, Image as ImageIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const AD_COSTS = [
  { impressions: 1000, cost: 100, label: "Starter" },
  { impressions: 5000, cost: 400, label: "Growth" },
  { impressions: 10000, cost: 700, label: "Premium" },
  { impressions: 50000, cost: 3000, label: "Mega" },
];

const AdsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [myAds, setMyAds] = useState<any[]>([]);
  const [allAds, setAllAds] = useState<any[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [selectedPlan, setSelectedPlan] = useState(0);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [placementSection, setPlacementSection] = useState<"home" | "reels" | "both">("home");
  const [placementFrequency, setPlacementFrequency] = useState(5);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    loadAds();
    supabase.from("profiles").select("jagx_coins").eq("user_id", user.id).single().then(({ data }) => setProfile(data));
    supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle()
      .then(({ data }) => {
        if (data) { setIsAdmin(true); loadAllAds(); }
      });
  }, [user]);

  const loadAds = async () => {
    if (!user) return;
    const { data } = await supabase.from("ads").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    if (data) setMyAds(data);
  };

  const loadAllAds = async () => {
    const { data } = await supabase.from("ads").select("*").order("created_at", { ascending: false }).limit(50);
    if (data) setAllAds(data);
  };

  const adminUpdate = async (id: string, patch: any) => {
    const { error } = await supabase.from("ads").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Updated");
    loadAllAds();
  };

  const createAd = async () => {
    if (!user || !title.trim()) return;
    const plan = AD_COSTS[selectedPlan];
    if ((profile?.jagx_coins || 0) < plan.cost) { toast.error("Insufficient JagX Coins"); return; }

    setCreating(true);
    let imageUrl = "";
    if (imageFile) {
      // Storage RLS requires the first folder = auth.uid()
      const ext = imageFile.name.split(".").pop() || "jpg";
      const path = `${user.id}/ads/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("posts").upload(path, imageFile, { upsert: false });
      if (upErr) { toast.error(`Image upload failed: ${upErr.message}`); setCreating(false); return; }
      imageUrl = supabase.storage.from("posts").getPublicUrl(path).data.publicUrl;
    }

    const { error } = await supabase.from("ads").insert({
      user_id: user.id, title: title.trim(), description: description.trim(),
      image_url: imageUrl || null, link_url: linkUrl.trim() || null,
      coin_cost: plan.cost, max_impressions: plan.impressions,
      placement_section: placementSection,
      placement_frequency: placementFrequency,
    });

    if (error) {
      toast.error(`Failed to create ad: ${error.message}`);
    } else {
      // Deduct coins only after the ad insert succeeded
      await supabase.from("profiles").update({ jagx_coins: (profile?.jagx_coins || 0) - plan.cost }).eq("user_id", user.id);
      toast.success("Ad created! 🎉");
      setShowCreate(false);
      setTitle(""); setDescription(""); setLinkUrl(""); setImageFile(null);
      loadAds();
      supabase.from("profiles").select("jagx_coins").eq("user_id", user.id).single().then(({ data }) => setProfile(data));
    }
    setCreating(false);
  };

  return (
    <div className="min-h-screen pb-24 bg-background">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/30">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="text-foreground"><ArrowLeft className="size-5" /></button>
            <h1 className="font-display italic text-xl text-gold">Ads</h1>
          </div>
          <button onClick={() => setShowCreate(true)} className="px-3 py-1.5 rounded-lg gold-gradient text-primary-foreground text-xs font-bold flex items-center gap-1">
            <Plus className="size-3" /> Create Ad
          </button>
        </div>
      </header>

      <div className="p-4 space-y-4">
        <div className="p-4 rounded-xl glass gold-glow">
          <p className="text-xs text-muted-foreground">Promote your content to the JagX community</p>
          <p className="text-sm text-champagne mt-1">Buy ad spots with JagX Coins and reach more people!</p>
        </div>

        {/* My ads */}
        <h3 className="text-sm font-semibold text-champagne">My Ads</h3>
        {myAds.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">No ads yet. Create your first ad!</p>
        ) : (
          myAds.map(ad => (
            <div key={ad.id} className="p-3 rounded-xl bg-surface border border-border/30">
              {ad.image_url && <img src={ad.image_url} className="w-full h-32 rounded-lg object-cover mb-2" />}
              <h4 className="text-sm font-semibold text-champagne">{ad.title}</h4>
              {ad.description && <p className="text-xs text-muted-foreground mt-1">{ad.description}</p>}
              <div className="flex items-center gap-4 mt-2">
                <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Eye className="size-3" /> {ad.impressions}/{ad.max_impressions}</span>
                <span className="text-[10px] text-gold flex items-center gap-1"><Coins className="size-3" /> {ad.coin_cost} coins</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${ad.status === "active" ? "bg-green-500/20 text-green-400" : "bg-muted text-muted-foreground"}`}>{ad.status}</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Shows in <span className="text-champagne">{ad.placement_section || "home"}</span> after every <span className="text-champagne">{ad.placement_frequency || 5}</span> posts
                {ad.admin_override && <span className="ml-1 text-yellow-400">· admin override active</span>}
              </p>
            </div>
          ))
        )}

        {/* Admin override panel */}
        {isAdmin && (
          <div className="mt-8 space-y-3">
            <h3 className="text-sm font-semibold text-yellow-400">🛡️ Admin · All Ads · Override Placement</h3>
            {allAds.map(ad => (
              <div key={ad.id} className="p-3 rounded-xl bg-surface border border-yellow-500/30 space-y-2">
                <p className="text-sm font-semibold text-champagne">{ad.title}</p>
                <div className="flex gap-2 items-center">
                  <select value={ad.admin_section || ad.placement_section || "home"}
                    onChange={(e) => adminUpdate(ad.id, { admin_section: e.target.value, admin_override: true })}
                    className="flex-1 px-2 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground">
                    <option value="home">Home Feed</option>
                    <option value="reels">Reels</option>
                    <option value="both">Both</option>
                  </select>
                  <input type="number" min={1} max={50}
                    value={ad.admin_frequency || ad.placement_frequency || 5}
                    onChange={(e) => adminUpdate(ad.id, { admin_frequency: Number(e.target.value), admin_override: true })}
                    className="w-20 px-2 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground" />
                  <span className="text-[10px] text-muted-foreground">every N posts</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => adminUpdate(ad.id, { admin_override: !ad.admin_override })}
                    className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest ${ad.admin_override ? "bg-yellow-500/20 text-yellow-400" : "bg-background border border-border text-muted-foreground"}`}>
                    {ad.admin_override ? "Override ON" : "Override OFF"}
                  </button>
                  <button onClick={() => adminUpdate(ad.id, { status: ad.status === "active" ? "paused" : "active" })}
                    className="flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest bg-background border border-border text-foreground">
                    {ad.status === "active" ? "Pause" : "Activate"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create ad modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
          <div className="flex items-center justify-between px-4 h-14 border-b border-border/30">
            <span className="font-semibold text-champagne">Create Ad</span>
            <button onClick={() => setShowCreate(false)} className="text-foreground">✕</button>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Ad Title *</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Your ad title"
                className="w-full px-4 py-3 rounded-xl bg-surface border border-border text-sm text-foreground outline-none" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Description</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe your ad"
                className="w-full px-4 py-3 rounded-xl bg-surface border border-border text-sm text-foreground outline-none h-20 resize-none" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Link URL</label>
              <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://..."
                className="w-full px-4 py-3 rounded-xl bg-surface border border-border text-sm text-foreground outline-none" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Image</label>
              <button onClick={() => fileRef.current?.click()} className="w-full py-8 rounded-xl border-2 border-dashed border-border flex flex-col items-center gap-2">
                <ImageIcon className="size-8 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{imageFile ? imageFile.name : "Tap to upload"}</span>
              </button>
              <input ref={fileRef} type="file" accept="image/*" onChange={e => setImageFile(e.target.files?.[0] || null)} className="hidden" />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Where should this ad appear?</label>
              <div className="grid grid-cols-3 gap-2">
                {(["home", "reels", "both"] as const).map((s) => (
                  <button key={s} onClick={() => setPlacementSection(s)}
                    className={`py-2 rounded-lg text-xs capitalize ${placementSection === s ? "gold-gradient text-primary-foreground font-bold" : "bg-surface border border-border text-foreground"}`}>
                    {s === "home" ? "Home Feed" : s === "reels" ? "Reels" : "Both"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Show after every N posts ({placementFrequency})</label>
              <input type="range" min={2} max={20} value={placementFrequency}
                onChange={(e) => setPlacementFrequency(Number(e.target.value))} className="w-full accent-gold" />
              <p className="text-[10px] text-muted-foreground">Lower = more impressions, higher = less intrusive</p>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-2 block">Choose Plan</label>
              <div className="space-y-2">
                {AD_COSTS.map((plan, i) => (
                  <button key={i} onClick={() => setSelectedPlan(i)}
                    className={`w-full p-3 rounded-xl border text-left flex justify-between items-center ${selectedPlan === i ? "border-gold gold-glow" : "border-border bg-surface"}`}>
                    <div>
                      <p className="text-sm font-semibold text-champagne">{plan.label}</p>
                      <p className="text-[10px] text-muted-foreground">{plan.impressions.toLocaleString()} impressions</p>
                    </div>
                    <span className="text-sm font-bold text-gold">🪙 {plan.cost}</span>
                  </button>
                ))}
              </div>
            </div>

            <button onClick={createAd} disabled={!title.trim() || creating}
              className="w-full py-3 rounded-xl gold-gradient text-primary-foreground font-bold text-sm disabled:opacity-50">
              {creating ? "Creating..." : `Create Ad (🪙 ${AD_COSTS[selectedPlan].cost})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdsPage;
