import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { motion } from "framer-motion";
import { Check } from "lucide-react";

interface PollBlockProps {
  postId: string;
  options: string[];
}

const PollBlock = ({ postId, options }: PollBlockProps) => {
  const { user } = useAuth();
  const [votes, setVotes] = useState<number[]>(options.map(() => 0));
  const [myVote, setMyVote] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("poll_votes").select("option_index, user_id").eq("post_id", postId);
    const counts = options.map(() => 0);
    data?.forEach(v => { if (v.option_index < counts.length) counts[v.option_index]++; });
    setVotes(counts);
    if (user) {
      const mine = data?.find(v => v.user_id === user.id);
      setMyVote(mine ? mine.option_index : null);
    }
  };

  useEffect(() => {
    load();
    const ch = supabase.channel(`poll-${postId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "poll_votes", filter: `post_id=eq.${postId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, user?.id]);

  const vote = async (idx: number) => {
    if (!user || loading) return;
    setLoading(true);
    if (myVote === idx) {
      await supabase.from("poll_votes").delete().eq("post_id", postId).eq("user_id", user.id);
      setMyVote(null);
    } else if (myVote !== null) {
      await supabase.from("poll_votes").update({ option_index: idx }).eq("post_id", postId).eq("user_id", user.id);
      setMyVote(idx);
    } else {
      await supabase.from("poll_votes").insert({ post_id: postId, user_id: user.id, option_index: idx });
      setMyVote(idx);
    }
    setLoading(false);
    load();
  };

  const total = votes.reduce((a, b) => a + b, 0);

  return (
    <div className="px-4 py-3 space-y-2">
      {options.map((opt, i) => {
        const count = votes[i];
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        const selected = myVote === i;
        return (
          <button
            key={i}
            onClick={() => vote(i)}
            disabled={!user}
            className={`relative w-full text-left rounded-xl border overflow-hidden transition-colors ${
              selected ? "border-gold bg-gold/10" : "border-border bg-surface hover:bg-surface-elevated"
            }`}
          >
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.5 }}
              className="absolute inset-y-0 left-0 bg-gold/20"
            />
            <div className="relative flex items-center justify-between px-4 py-2.5">
              <span className="flex items-center gap-2 text-sm text-foreground">
                {selected && <Check className="size-3.5 text-gold" />}
                {opt}
              </span>
              <span className="text-xs font-semibold text-champagne">{pct}% · {count}</span>
            </div>
          </button>
        );
      })}
      <p className="text-[10px] text-muted-foreground">{total} {total === 1 ? "vote" : "votes"}{!user && " · sign in to vote"}</p>
    </div>
  );
};

export default PollBlock;
