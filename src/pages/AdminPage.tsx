import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Shield, Users, BadgeCheck, Coins, Trash2, CheckCircle, XCircle, ArrowLeft, Search, Download, Receipt, Globe, ExternalLink, RefreshCw, Cookie, Activity, FileSearch, BarChart3, ToggleLeft, Rocket } from "lucide-react";
import { setConsent } from "@/components/CookieConsent";

const AdminPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"users" | "verification" | "transactions" | "ledger" | "seo" | "analytics" | "features">("users");
  const [featureFlags, setFeatureFlags] = useState<any[]>([]);
  const [appVersion, setAppVersion] = useState<string>("3.0");
  const [announcement, setAnnouncementInput] = useState<string>("");
  const [users, setUsers] = useState<any[]>([]);
  const [verifications, setVerifications] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<{
    loading: boolean;
    unlocks: any[];
    coinSpend: { gifts: number; unlocks: number; ads: number };
    engagement: { likes: number; comments: number; views: number; posts: number };
    polls: any[];
  }>({ loading: false, unlocks: [], coinSpend: { gifts: 0, unlocks: 0, ads: 0 }, engagement: { likes: 0, comments: 0, views: 0, posts: 0 }, polls: [] });
  const [search, setSearch] = useState("");
  const [seoChecks, setSeoChecks] = useState<{
    metaTag: boolean | null;
    htmlFile: boolean | null;
    gaLoaded: boolean | null;
    indexed: "checking" | "unknown";
    checking: boolean;
  }>({ metaTag: null, htmlFile: null, gaLoaded: null, indexed: "unknown", checking: false });

  const [scLoading, setScLoading] = useState(false);
  const [scSummary, setScSummary] = useState<any>(null);
  const [scPerf, setScPerf] = useState<any>(null);
  const [scError, setScError] = useState<string | null>(null);
  const [scDays, setScDays] = useState<number>(28);

  // Sitemap monitoring state
  const [fetchCheck, setFetchCheck] = useState<{ loading: boolean; results: any[]; checkedAt?: string }>({ loading: false, results: [] });
  const [scSitemaps, setScSitemaps] = useState<any[] | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const [structuredData, setStructuredData] = useState<{ count: number; types: string[]; valid: boolean } | null>(null);

  const loadSearchConsole = async () => {
    setScLoading(true); setScError(null);
    try {
      const summary = await supabase.functions.invoke("search-console", { body: { action: "summary" } });
      if (summary.error) throw new Error(summary.error.message);
      setScSummary(summary.data);
      const site = summary.data?.defaultSite || summary.data?.sites?.[0]?.siteUrl;
      if (site) {
        const perf = await supabase.functions.invoke("search-console", { body: { action: "performance", siteUrl: site, days: scDays } });
        if (perf.error) throw new Error(perf.error.message);
        setScPerf(perf.data);
      }
    } catch (e: any) {
      setScError(e?.message || "Failed to load Search Console data");
    } finally {
      setScLoading(false);
    }
  };

  const submitSitemapToGoogle = async () => {
    try {
      const site = scSummary?.defaultSite || scSummary?.sites?.[0]?.siteUrl;
      if (!site) { toast.error("No verified site found in Search Console"); return; }
      const r = await supabase.functions.invoke("search-console", {
        body: { action: "submit-sitemap", siteUrl: site, sitemapUrl: `${siteUrl}/sitemap.xml` },
      });
      if (r.error) throw new Error(r.error.message);
      toast.success("Sitemap submitted to Google");
    } catch (e: any) { toast.error(e?.message || "Submit failed"); }
  };

  const runFetchCheck = async () => {
    setFetchCheck({ loading: true, results: [] });
    try {
      const targets = [
        { name: "Static sitemap.xml", url: `${siteUrl}/sitemap.xml` },
        { name: "robots.txt", url: `${siteUrl}/robots.txt` },
        { name: "Dynamic sitemap (live)", url: dynamicSitemap },
      ];
      const r = await supabase.functions.invoke("search-console", {
        body: { action: "fetch-check", targets },
      });
      if (r.error) throw new Error(r.error.message);
      setFetchCheck({ loading: false, results: r.data?.results || [], checkedAt: r.data?.checkedAt });
      toast.success("Fetch check complete");
    } catch (e: any) {
      setFetchCheck({ loading: false, results: [] });
      toast.error(e?.message || "Fetch check failed");
    }
  };

  const loadSitemapsStatus = async () => {
    try {
      const site = scSummary?.defaultSite || scSummary?.sites?.[0]?.siteUrl;
      if (!site) return;
      const r = await supabase.functions.invoke("search-console", {
        body: { action: "sitemaps-status", siteUrl: site },
      });
      if (r.error) throw new Error(r.error.message);
      setScSitemaps(r.data?.sitemaps || []);
    } catch (e: any) {
      console.warn("sitemaps-status failed", e);
    }
  };

  const validateStructuredData = () => {
    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    const types: string[] = [];
    let valid = true;
    for (const s of scripts) {
      try {
        const data = JSON.parse(s.textContent || "{}");
        const t = Array.isArray(data) ? data.map(d => d["@type"]).join(",") : data["@type"];
        if (t) types.push(String(t));
      } catch { valid = false; }
    }
    setStructuredData({ count: scripts.length, types, valid });
  };

  const GA_ID = "G-LZWPQ1VYYN";
  const VERIFICATION_TOKEN = "Qklb38Qlmn1f5eBxEIPeHH13MMiczi7OpXnuUkQ9a84";
  const siteUrl = typeof window !== "undefined" ? window.location.origin : "";
  const SUPABASE_URL = "https://tmmeymhaxkrvngjfhave.supabase.co";
  const dynamicSitemap = `${SUPABASE_URL}/functions/v1/sitemap?origin=${encodeURIComponent(siteUrl)}`;

  const runSeoChecks = async () => {
    setSeoChecks(s => ({ ...s, checking: true }));
    // Meta tag check
    const meta = document.querySelector('meta[name="google-site-verification"]') as HTMLMetaElement | null;
    const metaOk = !!meta && meta.content === VERIFICATION_TOKEN;

    // HTML file check
    let htmlOk = false;
    try {
      const res = await fetch(`/google${VERIFICATION_TOKEN}.html`, { cache: "no-store" });
      htmlOk = res.ok;
    } catch {}

    // GA loaded
    const gaOk = typeof (window as any).gtag === "function" && Array.isArray((window as any).dataLayer);

    setSeoChecks({ metaTag: metaOk, htmlFile: htmlOk, gaLoaded: gaOk, indexed: "unknown", checking: false });
  };

  useEffect(() => {
    if (tab === "seo") {
      runSeoChecks();
      loadSearchConsole();
      runFetchCheck();
      validateStructuredData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Auto-refresh sitemap monitoring every 5 minutes when enabled
  useEffect(() => {
    if (!autoRefresh || tab !== "seo") return;
    const id = setInterval(() => {
      runFetchCheck();
      loadSitemapsStatus();
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, tab, scSummary]);

  // Pull SC sitemap status once summary is loaded
  useEffect(() => {
    if (tab === "seo" && scSummary) loadSitemapsStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scSummary, tab]);

  useEffect(() => {
    if (!user) return;
    checkAdmin();
  }, [user]);

  const checkAdmin = async () => {
    // Check user_roles table
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", user!.id);
    const admin = data?.some(r => r.role === "admin") || false;

    // Also check if this is the JagX account by email
    if (!admin && user?.email === "jagwazorld@gmail.com") {
      // Auto-assign admin role
      await supabase.from("user_roles").upsert({ user_id: user!.id, role: "admin" as any }, { onConflict: "user_id,role" });
      setIsAdmin(true);
    } else {
      setIsAdmin(admin);
    }
    setLoading(false);
    if (admin || user?.email === "jagwazorld@gmail.com") loadData();
  };

  const loadData = async () => {
    const [profilesRes, verificationsRes, transactionsRes, withdrawalsRes, ledgerRes] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("verification_requests").select("*").order("created_at", { ascending: false }),
      supabase.from("coin_transactions").select("*").eq("transaction_type", "withdrawal").order("created_at", { ascending: false }),
      supabase.from("withdrawal_requests").select("*").order("created_at", { ascending: false }),
      supabase.from("gift_ledger" as any).select("*").order("created_at", { ascending: false }).limit(1000),
    ]);
    if (profilesRes.data) setUsers(profilesRes.data);
    if (verificationsRes.data) setVerifications(verificationsRes.data);
    if (transactionsRes.data) setTransactions(transactionsRes.data);
    if (withdrawalsRes.data) setWithdrawals(withdrawalsRes.data);
    if (ledgerRes.data) setLedger(ledgerRes.data as any[]);
  };

  const loadAnalytics = async () => {
    setAnalytics(a => ({ ...a, loading: true }));
    const [unlocksRes, giftsRes, adsRes, likesRes, commentsRes, postsRes, pollsRes, votesRes] = await Promise.all([
      supabase.from("post_unlocks").select("post_id, user_id, coin_amount, created_at").order("created_at", { ascending: false }),
      supabase.from("gifts").select("coin_amount"),
      supabase.from("ads").select("coin_cost"),
      supabase.from("likes").select("post_id"),
      supabase.from("comments").select("post_id"),
      supabase.from("posts").select("id, content, view_count, is_poll, poll_options, unlock_price, user_id, created_at"),
      supabase.from("posts").select("id, content, poll_options, user_id").eq("is_poll", true),
      supabase.from("poll_votes").select("post_id, option_index"),
    ]);

    // Aggregate unlock revenue per post (count, unique buyers, revenue)
    const unlockByPost = new Map<string, { count: number; revenue: number; users: Set<string> }>();
    (unlocksRes.data || []).forEach((u: any) => {
      const p = unlockByPost.get(u.post_id) || { count: 0, revenue: 0, users: new Set<string>() };
      p.count += 1; p.revenue += u.coin_amount || 0;
      if (u.user_id) p.users.add(u.user_id);
      unlockByPost.set(u.post_id, p);
    });
    const postMap = new Map((postsRes.data || []).map((p: any) => [p.id, p]));
    const unlockRows = Array.from(unlockByPost.entries())
      .map(([postId, agg]) => {
        const p: any = postMap.get(postId);
        return {
          postId,
          count: agg.count,
          uniqueUsers: agg.users.size,
          revenue: agg.revenue,
          content: p?.content?.slice(0, 60) || "(post)",
          price: p?.unlock_price || 0,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);

    const coinSpend = {
      gifts: (giftsRes.data || []).reduce((s: number, g: any) => s + (g.coin_amount || 0), 0),
      unlocks: (unlocksRes.data || []).reduce((s: number, u: any) => s + (u.coin_amount || 0), 0),
      ads: (adsRes.data || []).reduce((s: number, a: any) => s + (a.coin_cost || 0), 0),
    };
    const engagement = {
      likes: likesRes.data?.length || 0,
      comments: commentsRes.data?.length || 0,
      views: (postsRes.data || []).reduce((s: number, p: any) => s + (p.view_count || 0), 0),
      posts: postsRes.data?.length || 0,
    };

    // Polls — vote tallies per option
    const votesByPost = new Map<string, Map<number, number>>();
    (votesRes.data || []).forEach((v: any) => {
      const m = votesByPost.get(v.post_id) || new Map();
      m.set(v.option_index, (m.get(v.option_index) || 0) + 1);
      votesByPost.set(v.post_id, m);
    });
    const polls = (pollsRes.data || []).map((p: any) => {
      const tally = votesByPost.get(p.id) || new Map();
      const options = (p.poll_options || []).map((opt: any, idx: number) => ({
        label: typeof opt === "string" ? opt : opt?.text || `Option ${idx + 1}`,
        votes: tally.get(idx) || 0,
      }));
      const total = options.reduce((s: number, o: any) => s + o.votes, 0);
      return { id: p.id, content: p.content?.slice(0, 60) || "(poll)", options, total };
    }).sort((a, b) => b.total - a.total);

    setAnalytics({ loading: false, unlocks: unlockRows, coinSpend, engagement, polls });
  };

  useEffect(() => { if (tab === "analytics" && isAdmin) loadAnalytics(); /* eslint-disable-next-line */ }, [tab, isAdmin]);

  // Load feature flags + version when entering Features tab
  const loadFeatures = async () => {
    const [{ data: flags }, { data: cfg }] = await Promise.all([
      supabase.from("feature_flags" as any).select("*").order("category").order("label"),
      supabase.from("app_config" as any).select("*"),
    ]);
    if (flags) setFeatureFlags(flags as any[]);
    if (cfg) {
      const map: Record<string, any> = {};
      (cfg as any[]).forEach(c => { map[c.key] = c.value; });
      if (map.version) setAppVersion(String(map.version).replace(/"/g, ""));
      if (map.announcement) setAnnouncementInput(String(map.announcement).replace(/"/g, ""));
    }
  };
  useEffect(() => { if (tab === "features" && isAdmin) loadFeatures(); /* eslint-disable-next-line */ }, [tab, isAdmin]);

  const toggleFeature = async (key: string, enabled: boolean) => {
    const { error } = await supabase.from("feature_flags" as any)
      .update({ enabled, updated_at: new Date().toISOString(), updated_by: user?.id })
      .eq("key", key);
    if (error) { toast.error(error.message); return; }
    setFeatureFlags(prev => prev.map(f => f.key === key ? { ...f, enabled } : f));
    toast.success(`${enabled ? "Enabled" : "Disabled"} — pushed live to all users`);
  };

  const saveVersion = async () => {
    const { error } = await supabase.from("app_config" as any)
      .upsert({ key: "version", value: appVersion, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) { toast.error(error.message); return; }
    toast.success(`Version pushed live: Buddy Connect ${appVersion}`);
  };

  const sendAnnouncement = async () => {
    if (!announcement.trim()) { toast.error("Type a message first"); return; }
    const { error } = await supabase.from("app_config" as any)
      .upsert({ key: "announcement", value: announcement, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) { toast.error(error.message); return; }
    toast.success("Broadcast sent to all users");
  };

  // Real-time: refresh withdrawal/verification requests as users submit them
  useEffect(() => {
    if (!isAdmin) return;
    const ch = supabase
      .channel("admin-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "withdrawal_requests" }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "verification_requests" }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [isAdmin]);

  const exportLedgerCsv = () => {
    if (ledger.length === 0) { toast.error("Nothing to export"); return; }
    const headers = ["created_at","gift_id","sender_username","recipient_username","debit_amount","creator_credit","platform_fee","gift_type","live_stream_id","post_id"];
    const rows = ledger.map(g => [
      g.created_at, g.gift_id,
      g.sender_username || g.sender_id, g.recipient_username || g.recipient_id,
      g.debit_amount, g.credit_amount, g.platform_fee,
      g.gift_type, g.live_stream_id || "", g.post_id || "",
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v ?? "").replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `jagx-gift-ledger-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success("Ledger exported");
  };

  const totals = ledger.reduce(
    (acc, g) => ({
      gross: acc.gross + (g.debit_amount || 0),
      creator: acc.creator + (g.credit_amount || 0),
      platform: acc.platform + (g.platform_fee || 0),
    }),
    { gross: 0, creator: 0, platform: 0 }
  );

  const toggleVerification = async (userId: string, currentStatus: boolean) => {
    const { error } = await supabase.from("profiles").update({ is_verified: !currentStatus }).eq("user_id", userId);
    if (error) { toast.error("Failed"); return; }
    setUsers(prev => prev.map(u => u.user_id === userId ? { ...u, is_verified: !currentStatus } : u));
    toast.success(!currentStatus ? "User verified! ✅" : "Verification removed");
  };

  const updateCoins = async (userId: string, amount: number) => {
    const { error } = await supabase.from("profiles").update({ jagx_coins: amount }).eq("user_id", userId);
    if (error) { toast.error("Failed"); return; }
    setUsers(prev => prev.map(u => u.user_id === userId ? { ...u, jagx_coins: amount } : u));
    toast.success("Coins updated!");
  };

  const deleteUser = async (userId: string) => {
    // Delete profile (cascade will handle related data)
    await supabase.from("profiles").delete().eq("user_id", userId);
    setUsers(prev => prev.filter(u => u.user_id !== userId));
    toast.success("User removed");
  };

  const filteredUsers = users.filter(u =>
    (u.username || "").toLowerCase().includes(search.toLowerCase()) ||
    (u.display_name || "").toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="size-10 rounded-full border-2 border-gold border-t-transparent animate-spin" />
    </div>
  );

  if (!isAdmin) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
      <Shield className="size-16 text-red-400" />
      <h1 className="text-xl font-bold text-foreground">Access Denied</h1>
      <p className="text-sm text-muted-foreground">You don't have admin privileges.</p>
      <button onClick={() => navigate("/")} className="px-6 py-2 rounded-xl gold-gradient text-primary-foreground text-sm font-bold">Go Home</button>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/30">
        <div className="flex items-center gap-3 px-4 h-14">
          <button onClick={() => navigate(-1)} className="text-foreground"><ArrowLeft className="size-5" /></button>
          <Shield className="size-5 text-gold" />
          <h1 className="text-sm font-semibold text-champagne">Admin Panel</h1>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex border-b border-border/30">
        {[
          { key: "users", icon: Users, label: "Users" },
          { key: "verification", icon: BadgeCheck, label: "Verify" },
          { key: "transactions", icon: Coins, label: "Withdrawals" },
          { key: "ledger", icon: Receipt, label: "Ledger" },
          { key: "analytics", icon: BarChart3, label: "Analytics" },
          { key: "seo", icon: Globe, label: "SEO" },
          { key: "features", icon: Rocket, label: "Features" },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`flex-1 py-3 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest transition-colors ${tab === t.key ? "text-gold border-b-2 border-gold" : "text-muted-foreground"}`}>
            <t.icon className="size-4" /> {t.label}
          </button>
        ))}
      </div>

      <div className="p-4">
        {tab === "users" && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface border border-border text-sm text-foreground placeholder:text-muted-foreground outline-none" />
            </div>
            <p className="text-xs text-muted-foreground">{users.length} total users</p>
            {filteredUsers.map(u => (
              <div key={u.id} className="p-3 rounded-xl bg-surface border border-border/30 space-y-2">
                <div className="flex items-center gap-3">
                  <img src={u.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.username}`} className="size-10 rounded-full object-cover" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="text-sm font-semibold text-foreground truncate">{u.display_name || u.username}</p>
                      {u.is_verified && <BadgeCheck className="size-3.5 text-gold flex-shrink-0" />}
                    </div>
                    <p className="text-xs text-muted-foreground">@{u.username} • {u.jagx_coins} coins</p>
                  </div>
                </div>
                {(u.last_ip || u.last_country || u.last_city) && (
                  <div className="text-[10px] text-muted-foreground bg-background/50 rounded-lg px-2 py-1.5 space-y-0.5">
                    <div className="flex items-center gap-1">
                      <Globe className="size-3 text-gold" />
                      <span className="text-champagne">
                        {[u.last_city, u.last_region, u.last_country].filter(Boolean).join(", ") || "Unknown location"}
                      </span>
                    </div>
                    {u.last_ip && <p>IP: <span className="font-mono text-foreground">{u.last_ip}</span></p>}
                    {u.last_seen_geo_at && <p>Seen: {new Date(u.last_seen_geo_at).toLocaleString()}</p>}
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={() => toggleVerification(u.user_id, u.is_verified)}
                    className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase flex items-center justify-center gap-1 ${u.is_verified ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"}`}>
                    {u.is_verified ? <><XCircle className="size-3" /> Unverify</> : <><CheckCircle className="size-3" /> Verify</>}
                  </button>
                  <button onClick={() => {
                    const amount = prompt("Set coins:", String(u.jagx_coins));
                    if (amount !== null) updateCoins(u.user_id, parseInt(amount) || 0);
                  }} className="flex-1 py-1.5 rounded-lg bg-gold/20 text-gold text-[10px] font-bold uppercase flex items-center justify-center gap-1">
                    <Coins className="size-3" /> Set Coins
                  </button>
                  <button onClick={() => deleteUser(u.user_id)}
                    className="py-1.5 px-3 rounded-lg bg-red-500/20 text-red-400 text-[10px] font-bold uppercase">
                    <Trash2 className="size-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "verification" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{verifications.length} verification requests</p>
            {verifications.map(v => (
              <div key={v.id} className="p-3 rounded-xl bg-surface border border-border/30 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">User: {v.user_id.slice(0, 8)}...</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${v.status === "approved" ? "bg-green-500/20 text-green-400" : v.status === "rejected" ? "bg-red-500/20 text-red-400" : "bg-gold/20 text-gold"}`}>
                    {v.status}
                  </span>
                </div>
                {v.payment_proof_url && <img src={v.payment_proof_url} className="w-full h-32 object-cover rounded-lg" />}
                {v.status === "pending" && (
                  <div className="flex gap-2">
                    <button onClick={async () => {
                      const { error } = await supabase.from("verification_requests").update({ status: "approved" }).eq("id", v.id);
                      if (error) { toast.error(error.message); return; }
                      toast.success("Approved — user notified in real time ✅");
                      loadData();
                    }} className="flex-1 py-1.5 rounded-lg bg-green-500/20 text-green-400 text-[10px] font-bold uppercase">
                      Approve
                    </button>
                    <button onClick={async () => {
                      const { error } = await supabase.from("verification_requests").update({ status: "rejected" }).eq("id", v.id);
                      if (error) { toast.error(error.message); return; }
                      toast.success("Rejected — user notified");
                      loadData();
                    }} className="flex-1 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-[10px] font-bold uppercase">
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
            {verifications.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No verification requests</p>}
          </div>
        )}

        {tab === "transactions" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{withdrawals.length} withdrawal requests</p>
            {withdrawals.map((w) => {
              const updateStatus = async (status: "approved" | "rejected" | "paid") => {
                let admin_notes: string | null = null;
                if (status === "rejected") {
                  admin_notes = prompt("Reason for rejection (shown to user):") || "Rejected by admin";
                }
                const { error } = await supabase.from("withdrawal_requests").update({
                  status, admin_notes,
                  processed_by: user!.id, processed_at: new Date().toISOString(),
                } as any).eq("id", w.id);
                if (error) { toast.error(error.message); return; }
                toast.success(`Marked ${status} — user notified in real time`);
                loadData();
              };
              return (
                <div key={w.id} className="p-3 rounded-xl bg-surface border border-border/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-gold">₦{w.amount_naira?.toLocaleString()} <span className="text-xs text-muted-foreground">({w.amount_coins} coins)</span></p>
                      <p className="text-[10px] text-muted-foreground">Payout: ₦{((w.payout_coins||0)*10).toLocaleString()} • Fee: ₦{((w.fee_coins||0)*10).toLocaleString()}</p>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${w.status === "paid" ? "bg-green-500/20 text-green-400" : w.status === "approved" ? "bg-blue-500/20 text-blue-400" : w.status === "rejected" ? "bg-red-500/20 text-red-400" : "bg-gold/20 text-gold"}`}>
                      {w.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-foreground space-y-0.5">
                    <p><span className="text-muted-foreground">Bank:</span> {w.bank_name}</p>
                    <p><span className="text-muted-foreground">Account:</span> {w.account_number} • {w.account_name}</p>
                    <p className="text-[10px] text-muted-foreground">User {w.user_id.slice(0,8)}… • {new Date(w.created_at).toLocaleString()}</p>
                    {w.admin_notes && <p className="text-[10px] text-red-400">Note: {w.admin_notes}</p>}
                  </div>
                  {w.status === "pending" && (
                    <div className="flex gap-2">
                      <button onClick={() => updateStatus("approved")} className="flex-1 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 text-[10px] font-bold uppercase">Approve</button>
                      <button onClick={() => updateStatus("rejected")} className="flex-1 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-[10px] font-bold uppercase">Reject</button>
                    </div>
                  )}
                  {w.status === "approved" && (
                    <button onClick={() => updateStatus("paid")} className="w-full py-1.5 rounded-lg bg-green-500/20 text-green-400 text-[10px] font-bold uppercase">
                      Mark as Paid (₦{((w.payout_coins||0)*10).toLocaleString()} sent)
                    </button>
                  )}
                </div>
              );
            })}
            {withdrawals.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No withdrawal requests</p>}
          </div>
        )}

        {tab === "ledger" && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 rounded-xl bg-surface border border-border/30">
                <p className="text-[10px] uppercase text-muted-foreground">Gross</p>
                <p className="text-sm font-bold text-foreground">🪙 {totals.gross.toLocaleString()}</p>
              </div>
              <div className="p-3 rounded-xl bg-surface border border-border/30">
                <p className="text-[10px] uppercase text-muted-foreground">Creators (70%)</p>
                <p className="text-sm font-bold text-gold">🪙 {totals.creator.toLocaleString()}</p>
              </div>
              <div className="p-3 rounded-xl bg-surface border border-border/30">
                <p className="text-[10px] uppercase text-muted-foreground">Platform (30%)</p>
                <p className="text-sm font-bold text-foreground">🪙 {totals.platform.toLocaleString()}</p>
              </div>
            </div>
            <button onClick={exportLedgerCsv} className="w-full py-2.5 rounded-xl gold-gradient text-primary-foreground font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2">
              <Download className="size-4" /> Download CSV Report
            </button>
            <p className="text-xs text-muted-foreground">{ledger.length} gift entries</p>
            <div className="space-y-2">
              {ledger.map((g) => (
                <div key={g.gift_id} className="p-3 rounded-xl bg-surface border border-border/30">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-foreground">
                      <span className="text-muted-foreground">@{g.sender_username || g.sender_id?.slice(0,6)}</span>
                      <span className="mx-1 text-muted-foreground">→</span>
                      <span className="font-semibold">@{g.recipient_username || g.recipient_id?.slice(0,6)}</span>
                    </p>
                    <span className="text-[10px] uppercase font-bold text-gold">{g.gift_type}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[11px]">
                    <span className="text-foreground">Debit 🪙{g.debit_amount}</span>
                    <span className="text-gold">Credit 🪙{g.credit_amount}</span>
                    <span className="text-muted-foreground">Fee 🪙{g.platform_fee}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">{new Date(g.created_at).toLocaleString()}</p>
                </div>
              ))}
              {ledger.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No gifts recorded yet</p>}
            </div>
          </div>
        )}

        {tab === "seo" && (
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-surface border border-border/30 space-y-1">
              <p className="text-[10px] uppercase text-muted-foreground tracking-widest">Site URL</p>
              <p className="text-xs text-foreground break-all">{siteUrl}</p>
              <p className="text-[10px] uppercase text-muted-foreground tracking-widest mt-2">GA4 Measurement ID</p>
              <p className="text-xs text-gold font-mono">{GA_ID}</p>
              <p className="text-[10px] uppercase text-muted-foreground tracking-widest mt-2">Verification Token</p>
              <p className="text-[10px] text-foreground font-mono break-all">{VERIFICATION_TOKEN}</p>
            </div>

            <button onClick={runSeoChecks} disabled={seoChecks.checking}
              className="w-full py-2 rounded-xl bg-surface border border-border text-xs font-bold uppercase tracking-widest text-foreground flex items-center justify-center gap-2">
              <RefreshCw className={`size-3 ${seoChecks.checking ? "animate-spin" : ""}`} /> Re-run checks
            </button>

            <div className="space-y-2">
              {[
                { label: "Google verification meta tag", ok: seoChecks.metaTag, hint: "Present in <head> of index.html" },
                { label: "Google verification HTML file", ok: seoChecks.htmlFile, hint: `/google${VERIFICATION_TOKEN}.html reachable` },
                { label: "Google Analytics (gtag.js) loaded", ok: seoChecks.gaLoaded, hint: "window.gtag and dataLayer ready" },
              ].map(c => (
                <div key={c.label} className="p-3 rounded-xl bg-surface border border-border/30 flex items-start gap-3">
                  {c.ok === null ? (
                    <div className="size-4 mt-0.5 rounded-full border border-muted-foreground/40" />
                  ) : c.ok ? (
                    <CheckCircle className="size-4 mt-0.5 text-green-400 flex-shrink-0" />
                  ) : (
                    <XCircle className="size-4 mt-0.5 text-red-400 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">{c.label}</p>
                    <p className="text-[11px] text-muted-foreground">{c.hint}</p>
                  </div>
                  <span className={`text-[10px] font-bold uppercase ${c.ok ? "text-green-400" : c.ok === false ? "text-red-400" : "text-muted-foreground"}`}>
                    {c.ok === null ? "..." : c.ok ? "OK" : "Missing"}
                  </span>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Search Console</p>
              {/* Sitemap Monitor */}
              <div className="p-3 rounded-xl bg-surface border border-gold/30 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-gold uppercase tracking-widest flex items-center gap-1.5">
                    <Activity className="size-3.5" /> Sitemap Monitor
                  </p>
                  <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} className="accent-gold" />
                    Auto-refresh 5m
                  </label>
                </div>
                <div className="flex gap-2">
                  <button onClick={runFetchCheck} disabled={fetchCheck.loading}
                    className="flex-1 py-2 rounded-lg gold-gradient text-primary-foreground text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-1">
                    <RefreshCw className={`size-3 ${fetchCheck.loading ? "animate-spin" : ""}`} /> Run fetch check
                  </button>
                  <button onClick={loadSitemapsStatus}
                    className="flex-1 py-2 rounded-lg bg-background border border-border text-[10px] font-bold uppercase tracking-widest text-foreground flex items-center justify-center gap-1">
                    <FileSearch className="size-3" /> SC ingestion
                  </button>
                </div>
                {fetchCheck.checkedAt && (
                  <p className="text-[10px] text-muted-foreground">Last checked: {new Date(fetchCheck.checkedAt).toLocaleTimeString()}</p>
                )}
                {fetchCheck.results.length > 0 && (
                  <div className="space-y-1.5">
                    {fetchCheck.results.map((r) => (
                      <div key={r.url} className="p-2 rounded-lg bg-background/50 border border-border/30">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold text-foreground truncate">{r.name}</span>
                          <span className={`text-[10px] font-bold uppercase ${r.ok ? "text-green-400" : "text-red-400"}`}>
                            {r.ok ? `${r.status} OK` : `FAIL ${r.status || ""}`}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {r.contentType || r.error || "—"} · {r.bytes ?? 0} bytes · {r.ms}ms
                          {typeof r.urlCount === "number" && r.urlCount > 0 && <> · <span className="text-gold">{r.urlCount} URLs</span></>}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                {scSitemaps && (
                  <div className="pt-2 border-t border-border/30">
                    <p className="text-[10px] uppercase text-muted-foreground">Search Console ingestion ({scSitemaps.length})</p>
                    {scSitemaps.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">No sitemaps registered yet. Click "Submit sitemap to Google" below.</p>
                    ) : (
                      <ul className="space-y-1 mt-1">
                        {scSitemaps.map((s: any) => (
                          <li key={s.path} className="text-[11px]">
                            <div className="flex justify-between gap-2">
                              <span className="text-foreground truncate">{s.path}</span>
                              <span className={s.errors > 0 ? "text-red-400" : "text-green-400"}>
                                {s.errors > 0 ? `${s.errors} err` : "OK"}
                              </span>
                            </div>
                            <p className="text-[10px] text-muted-foreground">
                              Last submitted: {s.lastSubmitted ? new Date(s.lastSubmitted).toLocaleString() : "—"}
                              {s.lastDownloaded && <> · Last downloaded: {new Date(s.lastDownloaded).toLocaleString()}</>}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              {/* Structured Data Validator */}
              <div className="p-3 rounded-xl bg-surface border border-border/30 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-foreground uppercase tracking-widest">Structured Data</p>
                  <button onClick={validateStructuredData}
                    className="text-[10px] uppercase font-bold text-gold flex items-center gap-1">
                    <RefreshCw className="size-3" /> Re-scan
                  </button>
                </div>
                {structuredData ? (
                  <>
                    <p className="text-[11px] text-foreground">
                      Found <span className="text-gold font-bold">{structuredData.count}</span> JSON-LD blocks ·
                      {structuredData.valid ? <span className="text-green-400"> all parse OK</span> : <span className="text-red-400"> parse error</span>}
                    </p>
                    {structuredData.types.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {structuredData.types.map((t, i) => (
                          <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-gold/10 text-gold border border-gold/30">{t}</span>
                        ))}
                      </div>
                    )}
                    <a href={`https://search.google.com/test/rich-results?url=${encodeURIComponent(siteUrl + window.location.pathname)}`}
                      target="_blank" rel="noopener noreferrer"
                      className="block text-[10px] text-gold underline mt-1">Validate this page in Google Rich Results Test →</a>
                  </>
                ) : (
                  <p className="text-[11px] text-muted-foreground">Click Re-scan to inspect.</p>
                )}
              </div>

            {/* Page-by-page JSON-LD coverage */}
            <div className="p-3 rounded-xl bg-surface border border-border/30 space-y-2">
              <p className="text-xs font-bold text-foreground uppercase tracking-widest">JSON-LD Coverage Report</p>
              <p className="text-[10px] text-muted-foreground">Global tags (WebSite + SearchAction + Organization) ship in index.html on every route.</p>
              <div className="space-y-1.5">
                {[
                  { route: "/", page: "Home Feed", schemas: ["WebPage", "WebSite", "SearchAction", "Organization"], missing: [] as string[] },
                  { route: "/reels", page: "Reels", schemas: ["ItemList", "WebSite", "SearchAction", "Organization"], missing: [] },
                  { route: "/discover", page: "Discover", schemas: ["CollectionPage", "WebSite", "SearchAction", "Organization"], missing: [] },
                  { route: "/live", page: "Live", schemas: ["CollectionPage", "WebSite", "SearchAction", "Organization"], missing: [] },
                  { route: "/chat", page: "Messages", schemas: ["WebSite", "SearchAction", "Organization"], missing: ["WebPage"] },
                  { route: "/profile", page: "Profile", schemas: ["WebSite", "SearchAction", "Organization"], missing: ["ProfilePage", "Person"] },
                  { route: "/coins", page: "Coins", schemas: ["WebSite", "SearchAction", "Organization"], missing: ["WebPage"] },
                  { route: "/notifications", page: "Notifications", schemas: ["WebSite", "SearchAction", "Organization"], missing: ["WebPage"] },
                  { route: "/auth", page: "Auth", schemas: ["WebSite", "SearchAction", "Organization"], missing: ["WebPage"] },
                  { route: "/admin", page: "Admin", schemas: [], missing: ["(noindex - intentional)"] },
                ].map(r => (
                  <div key={r.route} className="p-2 rounded-lg bg-background/50 border border-border/30">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[11px] font-mono text-gold">{r.route}</span>
                        <span className="text-[10px] text-muted-foreground truncate">{r.page}</span>
                      </div>
                      <span className={`text-[10px] font-bold uppercase ${r.missing.length === 0 ? "text-green-400" : "text-yellow-400"}`}>
                        {r.missing.length === 0 ? "Full" : `${r.missing.length} missing`}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {r.schemas.map(s => (
                        <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-gold/10 text-gold border border-gold/20">{s}</span>
                      ))}
                      {r.missing.map(s => (
                        <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">{s}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

              {/* Live Search Console API data */}
              <div className="p-3 rounded-xl bg-surface border border-gold/30 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-gold uppercase tracking-widest">Live API Data</p>
                  <button onClick={loadSearchConsole} disabled={scLoading}
                    className="text-[10px] uppercase font-bold text-foreground flex items-center gap-1">
                    <RefreshCw className={`size-3 ${scLoading ? "animate-spin" : ""}`} /> Refresh
                  </button>
                </div>
                {scError && (
                  <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-[11px] text-red-400 break-words">
                    {scError}
                    <p className="mt-1 text-muted-foreground">Tip: add the service-account email below as a user (Owner) in Search Console for your verified property.</p>
                  </div>
                )}
                {scSummary?.serviceAccountEmail && (
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">Service account email</p>
                    <p className="text-[11px] font-mono text-foreground break-all">{scSummary.serviceAccountEmail}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Add this email as Owner in Search Console → Settings → Users and permissions.</p>
                  </div>
                )}
                {scSummary?.sites && (
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">Properties ({scSummary.sites.length})</p>
                    {scSummary.sites.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">No properties accessible yet.</p>
                    ) : (
                      <ul className="space-y-1 mt-1">
                        {scSummary.sites.map((s: any) => (
                          <li key={s.siteUrl} className="text-[11px] text-foreground flex justify-between gap-2">
                            <span className="truncate">{s.siteUrl}</span>
                            <span className="text-gold uppercase">{s.permissionLevel}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {scSummary?.inspection?.inspectionResult?.indexStatusResult && (
                  <div className="pt-2 border-t border-border/30">
                    <p className="text-[10px] uppercase text-muted-foreground">Index status</p>
                    <p className="text-[11px] text-foreground">
                      Verdict: <span className="text-gold font-bold">{scSummary.inspection.inspectionResult.indexStatusResult.verdict}</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">Coverage: {scSummary.inspection.inspectionResult.indexStatusResult.coverageState}</p>
                    {scSummary.inspection.inspectionResult.indexStatusResult.lastCrawlTime && (
                      <p className="text-[11px] text-muted-foreground">Last crawl: {new Date(scSummary.inspection.inspectionResult.indexStatusResult.lastCrawlTime).toLocaleString()}</p>
                    )}
                  </div>
                )}
                {scPerf?.totals && (
                  <div className="pt-2 border-t border-border/30">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] uppercase text-muted-foreground">Last {scPerf.range.days} days</p>
                      <select value={scDays} onChange={e => { setScDays(Number(e.target.value)); }}
                        className="bg-background border border-border rounded text-[10px] text-foreground px-1 py-0.5">
                        {[7,14,28,60,90].map(d => <option key={d} value={d}>{d}d</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div className="p-2 rounded bg-background/50"><p className="text-[10px] text-muted-foreground">Clicks</p><p className="text-sm font-bold text-gold">{scPerf.totals.clicks ?? 0}</p></div>
                      <div className="p-2 rounded bg-background/50"><p className="text-[10px] text-muted-foreground">Impressions</p><p className="text-sm font-bold text-foreground">{scPerf.totals.impressions ?? 0}</p></div>
                      <div className="p-2 rounded bg-background/50"><p className="text-[10px] text-muted-foreground">CTR</p><p className="text-sm font-bold text-foreground">{((scPerf.totals.ctr ?? 0)*100).toFixed(2)}%</p></div>
                      <div className="p-2 rounded bg-background/50"><p className="text-[10px] text-muted-foreground">Avg position</p><p className="text-sm font-bold text-foreground">{(scPerf.totals.position ?? 0).toFixed(1)}</p></div>
                    </div>
                    {scPerf.queries?.length > 0 && (
                      <div className="mt-2">
                        <p className="text-[10px] uppercase text-muted-foreground">Top queries</p>
                        <ul className="space-y-1 mt-1">
                          {scPerf.queries.slice(0,10).map((q: any) => (
                            <li key={q.keys?.[0]} className="flex justify-between text-[11px]">
                              <span className="text-foreground truncate">{q.keys?.[0]}</span>
                              <span className="text-muted-foreground">{q.clicks} clicks · {q.impressions} impr</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                <button onClick={submitSitemapToGoogle}
                  className="w-full mt-2 py-2 rounded-lg gold-gradient text-primary-foreground text-[10px] font-bold uppercase tracking-widest">
                  Submit sitemap to Google
                </button>
              </div>
              {[
                { label: "Open Search Console", url: "https://search.google.com/search-console" },
                { label: "Verify ownership (URL prefix)", url: `https://search.google.com/search-console/welcome?siteUrl=${encodeURIComponent(siteUrl)}` },
                { label: "Check URL indexing status", url: `https://search.google.com/search-console/inspect?resource_id=${encodeURIComponent(siteUrl)}&id=${encodeURIComponent(siteUrl)}` },
                { label: "Submit sitemap", url: `https://search.google.com/search-console/sitemaps?resource_id=${encodeURIComponent(siteUrl)}` },
                { label: "Performance report", url: `https://search.google.com/search-console/performance/search-analytics?resource_id=${encodeURIComponent(siteUrl)}` },
                { label: "Google site:search (is it indexed?)", url: `https://www.google.com/search?q=site:${encodeURIComponent(siteUrl.replace(/^https?:\/\//,""))}` },
                { label: "View static sitemap.xml", url: `${siteUrl}/sitemap.xml` },
                { label: "View robots.txt", url: `${siteUrl}/robots.txt` },
                { label: "View dynamic sitemap (live data)", url: dynamicSitemap },
              ].map(l => (
                <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer"
                  className="p-3 rounded-xl bg-surface border border-border/30 flex items-center justify-between hover:border-gold/40 transition-colors">
                  <span className="text-sm text-foreground">{l.label}</span>
                  <ExternalLink className="size-4 text-gold" />
                </a>
              ))}
            </div>

            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Google Analytics</p>
              {[
                { label: "Open GA4 Realtime", url: `https://analytics.google.com/analytics/web/#/p/realtime/overview` },
                { label: "Open GA4 Reports", url: `https://analytics.google.com/analytics/web/` },
                { label: "Send test event", action: () => {
                  if (typeof window.gtag === "function") {
                    window.gtag("event", "admin_test_event", { source: "admin_panel", ts: Date.now() });
                    toast.success("Test event sent to GA4");
                  } else { toast.error("gtag not loaded yet"); }
                }},
              ].map(l => l.url ? (
                <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer"
                  className="p-3 rounded-xl bg-surface border border-border/30 flex items-center justify-between hover:border-gold/40 transition-colors">
                  <span className="text-sm text-foreground">{l.label}</span>
                  <ExternalLink className="size-4 text-gold" />
                </a>
              ) : (
                <button key={l.label} onClick={l.action}
                  className="w-full p-3 rounded-xl bg-surface border border-border/30 flex items-center justify-between hover:border-gold/40 transition-colors text-left">
                  <span className="text-sm text-foreground">{l.label}</span>
                  <span className="text-[10px] font-bold uppercase text-gold">Run</span>
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Privacy & Consent</p>
              <button onClick={() => { setConsent(true); toast.success("Analytics consent granted"); }}
                className="w-full p-3 rounded-xl bg-surface border border-border/30 flex items-center justify-between hover:border-gold/40">
                <span className="text-sm text-foreground flex items-center gap-2"><Cookie className="size-4 text-gold" /> Grant analytics consent</span>
                <span className="text-[10px] font-bold uppercase text-green-400">Opt In</span>
              </button>
              <button onClick={() => { setConsent(false); toast.success("Analytics consent revoked"); }}
                className="w-full p-3 rounded-xl bg-surface border border-border/30 flex items-center justify-between hover:border-gold/40">
                <span className="text-sm text-foreground flex items-center gap-2"><Cookie className="size-4 text-muted-foreground" /> Revoke analytics consent</span>
                <span className="text-[10px] font-bold uppercase text-red-400">Opt Out</span>
              </button>
              <button onClick={() => { localStorage.removeItem("jagx_consent"); toast.success("Consent reset — banner will reappear on reload"); }}
                className="w-full p-3 rounded-xl bg-surface border border-border/30 flex items-center justify-between hover:border-gold/40">
                <span className="text-sm text-foreground">Reset consent banner</span>
                <span className="text-[10px] font-bold uppercase text-gold">Reset</span>
              </button>
            </div>
          </div>
        )}

        {tab === "analytics" && (
          <div className="space-y-4">
            <button onClick={loadAnalytics} disabled={analytics.loading}
              className="w-full py-2 rounded-xl bg-surface border border-border text-xs font-bold uppercase tracking-widest text-foreground flex items-center justify-center gap-2">
              <RefreshCw className={`size-3 ${analytics.loading ? "animate-spin" : ""}`} /> Refresh analytics
            </button>

            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Coin Spend</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="p-3 rounded-xl bg-surface border border-border/30">
                  <p className="text-[10px] uppercase text-muted-foreground">Gifts</p>
                  <p className="text-sm font-bold text-gold">🪙 {analytics.coinSpend.gifts.toLocaleString()}</p>
                </div>
                <div className="p-3 rounded-xl bg-surface border border-border/30">
                  <p className="text-[10px] uppercase text-muted-foreground">Unlocks</p>
                  <p className="text-sm font-bold text-gold">🪙 {analytics.coinSpend.unlocks.toLocaleString()}</p>
                </div>
                <div className="p-3 rounded-xl bg-surface border border-border/30">
                  <p className="text-[10px] uppercase text-muted-foreground">Ads</p>
                  <p className="text-sm font-bold text-gold">🪙 {analytics.coinSpend.ads.toLocaleString()}</p>
                </div>
              </div>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Engagement</p>
              <div className="grid grid-cols-4 gap-2">
                <div className="p-2 rounded-xl bg-surface border border-border/30">
                  <p className="text-[10px] uppercase text-muted-foreground">Posts</p>
                  <p className="text-sm font-bold text-foreground">{analytics.engagement.posts}</p>
                </div>
                <div className="p-2 rounded-xl bg-surface border border-border/30">
                  <p className="text-[10px] uppercase text-muted-foreground">Likes</p>
                  <p className="text-sm font-bold text-foreground">{analytics.engagement.likes}</p>
                </div>
                <div className="p-2 rounded-xl bg-surface border border-border/30">
                  <p className="text-[10px] uppercase text-muted-foreground">Comments</p>
                  <p className="text-sm font-bold text-foreground">{analytics.engagement.comments}</p>
                </div>
                <div className="p-2 rounded-xl bg-surface border border-border/30">
                  <p className="text-[10px] uppercase text-muted-foreground">Views</p>
                  <p className="text-sm font-bold text-foreground">{analytics.engagement.views}</p>
                </div>
              </div>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Post Unlock Revenue (per post)</p>
              <div className="space-y-2">
                {analytics.unlocks.length === 0 && <p className="text-xs text-muted-foreground">No paid unlocks yet.</p>}
                {analytics.unlocks.slice(0, 25).map(u => (
                  <div key={u.postId} className="p-3 rounded-xl bg-surface border border-border/30">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-foreground truncate">{u.content}</p>
                      <span className="text-xs font-bold text-gold whitespace-nowrap">🪙 {u.revenue.toLocaleString()}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Price 🪙{u.price} · {u.count} unlocks · {u.uniqueUsers} unique {u.uniqueUsers === 1 ? "buyer" : "buyers"}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Poll Performance</p>
              <div className="space-y-2">
                {analytics.polls.length === 0 && <p className="text-xs text-muted-foreground">No polls yet.</p>}
                {analytics.polls.slice(0, 25).map(p => (
                  <div key={p.id} className="p-3 rounded-xl bg-surface border border-border/30 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-foreground truncate">{p.content}</p>
                      <span className="text-[10px] font-bold uppercase text-gold whitespace-nowrap">{p.total} votes</span>
                    </div>
                    {p.options.map((o: any, i: number) => {
                      const pct = p.total > 0 ? Math.round((o.votes / p.total) * 100) : 0;
                      return (
                        <div key={i}>
                          <div className="flex items-center justify-between text-[11px] text-foreground">
                            <span className="truncate">{o.label}</span>
                            <span className="text-muted-foreground">{o.votes} · {pct}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-background/60 overflow-hidden">
                            <div className="h-full gold-gradient" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "features" && (
          <div className="space-y-5">
            <div className="p-4 rounded-2xl bg-surface border border-gold/30 space-y-3">
              <p className="text-[10px] uppercase tracking-widest text-gold flex items-center gap-1"><Rocket className="size-3" /> App Version</p>
              <div className="flex gap-2">
                <input value={appVersion} onChange={e => setAppVersion(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl bg-background border border-border/30 text-sm text-foreground" placeholder="3.0" />
                <button onClick={saveVersion} className="px-4 rounded-xl gold-gradient text-black text-xs font-bold uppercase tracking-widest">Push live</button>
              </div>
              <p className="text-[10px] text-muted-foreground">Changing the version notifies every online user instantly.</p>
            </div>

            <div className="p-4 rounded-2xl bg-surface border border-border/30 space-y-3">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Global Announcement</p>
              <textarea value={announcement} onChange={e => setAnnouncementInput(e.target.value)} rows={2}
                placeholder="Type a message to broadcast to all users…"
                className="w-full px-3 py-2 rounded-xl bg-background border border-border/30 text-sm text-foreground resize-none" />
              <button onClick={sendAnnouncement} className="w-full py-2 rounded-xl bg-gold/20 border border-gold/40 text-xs font-bold uppercase tracking-widest text-gold">📢 Broadcast now</button>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                Feature toggles ({featureFlags.length}) — flip on to push instantly to every user
              </p>
              <div className="space-y-2">
                {featureFlags.length === 0 && (
                  <p className="text-xs text-muted-foreground p-4 text-center">
                    No features loaded. Run the SQL migration first (see MIGRATION.md).
                  </p>
                )}
                {featureFlags.map(f => (
                  <div key={f.key} className="p-3 rounded-xl bg-surface border border-border/30 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground truncate">{f.label}</p>
                        <span className="text-[9px] uppercase tracking-widest text-muted-foreground px-1.5 py-0.5 rounded bg-background/60">{f.category}</span>
                      </div>
                      {f.description && <p className="text-[11px] text-muted-foreground truncate">{f.description}</p>}
                    </div>
                    <button onClick={() => toggleFeature(f.key, !f.enabled)}
                      className={`shrink-0 w-12 h-6 rounded-full relative transition-colors ${f.enabled ? "bg-gold" : "bg-border"}`}>
                      <span className={`absolute top-0.5 size-5 rounded-full bg-background transition-all ${f.enabled ? "left-[26px]" : "left-0.5"}`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPage;
