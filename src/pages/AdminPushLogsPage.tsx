import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, RefreshCw, CheckCircle2, XCircle, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type PushLog = {
  id: string;
  created_at: string;
  sender_id: string | null;
  recipient_user_id: string | null;
  token: string | null;
  topic: string | null;
  title: string | null;
  body: string | null;
  url: string | null;
  target_kind: string;
  success: boolean;
  status_code: number | null;
  error: string | null;
};

const RANGES: Record<string, number> = {
  "1h": 1, "24h": 24, "7d": 24 * 7, "30d": 24 * 30, "all": 0,
};

const AdminPushLogsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [logs, setLogs] = useState<PushLog[]>([]);
  const [actors, setActors] = useState<Record<string, { username: string }>>({});
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<keyof typeof RANGES>("24h");
  const [status, setStatus] = useState<"all" | "success" | "failure">("all");
  const [kind, setKind] = useState<string>("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await (supabase as any).rpc("has_role", {
        _user_id: user.id, _role: "admin",
      });
      setIsAdmin(Boolean(data));
    })();
  }, [user]);

  const load = async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      let query = (supabase as any).from("push_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (RANGES[range] > 0) {
        const since = new Date(Date.now() - RANGES[range] * 3_600_000).toISOString();
        query = query.gte("created_at", since);
      }
      if (status === "success") query = query.eq("success", true);
      if (status === "failure") query = query.eq("success", false);
      if (kind !== "all") query = query.eq("target_kind", kind);
      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? []) as PushLog[];
      setLogs(rows);

      // Resolve recipient usernames.
      const ids = Array.from(new Set(rows.map((r) => r.recipient_user_id).filter(Boolean))) as string[];
      if (ids.length) {
        const { data: profs } = await (supabase as any).from("profiles")
          .select("id, username").in("id", ids);
        const map: Record<string, { username: string }> = {};
        for (const p of profs ?? []) map[p.id] = { username: p.username ?? "—" };
        setActors(map);
      }
    } catch (e: any) {
      console.warn("[push-logs] load failed", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (isAdmin) load(); /* eslint-disable-next-line */ }, [isAdmin, range, status, kind]);

  const filtered = useMemo(() => {
    if (!q.trim()) return logs;
    const needle = q.toLowerCase();
    return logs.filter((l) =>
      [l.title, l.body, l.topic, l.error, l.token, actors[l.recipient_user_id ?? ""]?.username]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(needle))
    );
  }, [logs, q, actors]);

  const totals = useMemo(() => {
    const sent = logs.filter((l) => l.success).length;
    return { sent, failed: logs.length - sent, total: logs.length };
  }, [logs]);

  if (isAdmin === null) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }
  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6">
        <p className="text-muted-foreground">Admins only.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/")}>Go home</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/30">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/admin")} aria-label="Back" className="text-muted-foreground">
              <ArrowLeft className="size-5" />
            </button>
            <h1 className="font-display italic text-xl text-gold">Push logs</h1>
          </div>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw className={`size-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 px-3 pb-3">
          <select value={range} onChange={(e) => setRange(e.target.value as any)}
            className="text-xs bg-surface border border-border/40 rounded-md px-2 py-1">
            <option value="1h">Last hour</option>
            <option value="24h">Last 24h</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="all">All time</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value as any)}
            className="text-xs bg-surface border border-border/40 rounded-md px-2 py-1">
            <option value="all">All status</option>
            <option value="success">Success</option>
            <option value="failure">Failure</option>
          </select>
          <select value={kind} onChange={(e) => setKind(e.target.value)}
            className="text-xs bg-surface border border-border/40 rounded-md px-2 py-1">
            <option value="all">All targets</option>
            <option value="self">Self</option>
            <option value="user">User</option>
            <option value="token">Token</option>
            <option value="broadcast">Broadcast</option>
            <option value="topic">Topic</option>
            <option value="condition">Condition</option>
          </select>
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, error, user…"
              className="h-8 pl-7 text-xs" />
          </div>
        </div>

        <div className="flex gap-4 px-4 pb-2 text-xs text-muted-foreground">
          <span>Total: <b className="text-foreground">{totals.total}</b></span>
          <span className="text-green-500">✓ {totals.sent}</span>
          <span className="text-red-500">✕ {totals.failed}</span>
        </div>
      </header>

      {filtered.length === 0 ? (
        <div className="py-20 text-center text-sm text-muted-foreground">No push logs in this range.</div>
      ) : (
        <ul className="divide-y divide-border/20">
          {filtered.map((l) => (
            <li key={l.id} className="px-4 py-3 text-sm">
              <div className="flex items-start gap-2">
                {l.success
                  ? <CheckCircle2 className="size-4 mt-0.5 text-green-500 shrink-0" />
                  : <XCircle className="size-4 mt-0.5 text-red-500 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium truncate">{l.title || "(no title)"}</span>
                    <span className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString()}</span>
                  </div>
                  {l.body && <p className="text-xs text-muted-foreground line-clamp-2">{l.body}</p>}
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    <span>kind: <b className="text-foreground">{l.target_kind}</b></span>
                    {l.topic && <span>topic: <b className="text-foreground">{l.topic}</b></span>}
                    {l.recipient_user_id && (
                      <span>to: <b className="text-foreground">@{actors[l.recipient_user_id]?.username ?? l.recipient_user_id.slice(0, 8)}</b></span>
                    )}
                    {l.token && <span title={l.token}>token: <code>{l.token.slice(0, 10)}…</code></span>}
                    {l.url && l.url !== "/" && <span>url: <code>{l.url}</code></span>}
                    {l.status_code != null && <span>http: {l.status_code}</span>}
                  </div>
                  {l.error && (
                    <pre className="mt-1 text-xs text-red-400 whitespace-pre-wrap break-all bg-red-500/5 rounded p-2 max-h-32 overflow-auto">
                      {l.error}
                    </pre>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AdminPushLogsPage;
