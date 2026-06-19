import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/**
 * Renders text and turns @username mentions into clickable links to that user's profile.
 * Resolves usernames -> user_id lazily and caches the result.
 */
const usernameCache = new Map<string, string | null>();

const TaggedText = ({ text, className = "" }: { text: string; className?: string }) => {
  const navigate = useNavigate();
  const [, setTick] = useState(0);

  const parts = text.split(/(@[A-Za-z0-9_]+)/g);
  const mentions = parts.filter(p => p.startsWith("@")).map(p => p.slice(1).toLowerCase());

  useEffect(() => {
    const toFetch = mentions.filter(m => !usernameCache.has(m));
    if (toFetch.length === 0) return;
    supabase.from("profiles").select("user_id, username").in("username", toFetch).then(({ data }) => {
      toFetch.forEach(u => usernameCache.set(u, null));
      data?.forEach(p => p.username && usernameCache.set(p.username.toLowerCase(), p.user_id));
      setTick(t => t + 1);
    });
  }, [text]);

  return (
    <span className={className}>
      {parts.map((p, i) => {
        if (!p.startsWith("@")) return <span key={i}>{p}</span>;
        const uname = p.slice(1).toLowerCase();
        const uid = usernameCache.get(uname);
        return (
          <button
            key={i}
            onClick={(e) => { e.stopPropagation(); if (uid) navigate(`/user/${uid}`); }}
            className="text-gold font-semibold hover:underline"
            disabled={!uid}
          >
            {p}
          </button>
        );
      })}
    </span>
  );
};

export default TaggedText;
