import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import BottomNav from "@/components/BottomNav";

// Minimal placeholder home feed. The original feed page was accidentally
// overwritten with edge-function code. Revert via chat History to restore.
const Index = () => {
  const { user } = useAuth();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from("posts")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(20);
        setPosts(data || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="min-h-screen bg-black text-white pb-20">
      <header className="p-4 border-b border-white/10">
        <h1 className="text-xl font-bold">JagX Buddy Connect</h1>
        {user && <p className="text-xs text-white/50">Welcome back</p>}
      </header>

      <main className="p-4 space-y-3">
        {loading && <p className="text-white/60 text-sm">Loading feed…</p>}
        {!loading && posts.length === 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
            <p className="font-semibold mb-1">Feed is empty.</p>
            <p className="text-white/70">
              Your home feed page was overwritten. Open chat History and revert to a version
              from before "Enable Cloud" to restore your original feed and database.
            </p>
          </div>
        )}
        {posts.map((p) => (
          <article key={p.id} className="rounded-lg bg-white/5 p-3">
            <p className="text-sm whitespace-pre-wrap">{p.content}</p>
          </article>
        ))}
      </main>

      <BottomNav />
    </div>
  );
};

export default Index;
