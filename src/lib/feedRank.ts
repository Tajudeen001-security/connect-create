// Smart feed ranking. Scores posts by predicted interest using the
// signed-in user's like history (authors + hashtags), follow graph,
// recent search terms (localStorage), and recency. Pure client-side —
// no schema changes needed.
import { supabase } from "@/integrations/supabase/client";

const HASHTAG_RE = /#([\p{L}\p{N}_]+)/gu;

export const extractHashtags = (text?: string | null): string[] => {
  if (!text) return [];
  const out: string[] = [];
  for (const m of text.matchAll(HASHTAG_RE)) out.push(m[1].toLowerCase());
  return out;
};

export const getRecentSearches = (): string[] => {
  try {
    const raw = localStorage.getItem("jagx_recent_searches");
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(0, 20).map((s: any) => String(s).toLowerCase()) : [];
  } catch { return []; }
};

export const pushRecentSearch = (term: string) => {
  const t = term.trim().toLowerCase();
  if (!t) return;
  try {
    const cur = getRecentSearches().filter((x) => x !== t);
    cur.unshift(t);
    localStorage.setItem("jagx_recent_searches", JSON.stringify(cur.slice(0, 20)));
  } catch { /* noop */ }
};

export interface UserAffinity {
  authors: Map<string, number>;   // user_id → weight
  hashtags: Map<string, number>;  // tag (lowercase) → weight
  follows: Set<string>;           // user_ids the user follows
  searches: string[];             // recent search terms, lowercase
}

/**
 * Builds an affinity profile from the user's last 100 likes and their
 * follow graph. Authors of liked posts get +1; hashtags inside liked
 * captions get +1 each. Cheap — runs once per feed load.
 */
export const buildUserAffinity = async (userId: string): Promise<UserAffinity> => {
  const authors = new Map<string, number>();
  const hashtags = new Map<string, number>();
  const follows = new Set<string>();

  const [{ data: likes }, { data: followRows }] = await Promise.all([
    supabase.from("likes").select("post_id").eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
    supabase.from("followers").select("following_id").eq("follower_id", userId).limit(500),
  ]);

  followRows?.forEach((f: any) => follows.add(f.following_id));

  const likedPostIds = (likes || []).map((l: any) => l.post_id);
  if (likedPostIds.length > 0) {
    const { data: likedPosts } = await supabase
      .from("posts")
      .select("user_id, content")
      .in("id", likedPostIds);
    likedPosts?.forEach((p: any) => {
      authors.set(p.user_id, (authors.get(p.user_id) || 0) + 1);
      for (const tag of extractHashtags(p.content)) {
        hashtags.set(tag, (hashtags.get(tag) || 0) + 1);
      }
    });
  }

  return { authors, hashtags, follows, searches: getRecentSearches() };
};

/**
 * Score a single post. Higher = more likely to interest the user.
 * Tunable weights live here — keep them small and well-commented so
 * the ranking stays explainable.
 */
export const scorePost = (
  post: { id: string; user_id: string; content?: string | null; created_at: string; view_count?: number | null },
  aff: UserAffinity,
  globalLikes: number = 0,
  globalComments: number = 0,
): number => {
  let score = 0;

  // Author affinity — strongest signal
  score += (aff.authors.get(post.user_id) || 0) * 3;

  // Following the author
  if (aff.follows.has(post.user_id)) score += 4;

  // Hashtag affinity (liked + searched)
  const tags = extractHashtags(post.content);
  for (const t of tags) {
    score += (aff.hashtags.get(t) || 0) * 1.5;
    if (aff.searches.some((s) => s.includes(t) || t.includes(s))) score += 2;
  }

  // Search-term match in caption body
  if (post.content && aff.searches.length > 0) {
    const lc = post.content.toLowerCase();
    for (const s of aff.searches) if (s.length > 2 && lc.includes(s)) score += 1;
  }

  // Mild popularity prior so cold-start users still see good content
  score += Math.log1p(globalLikes) * 0.5 + Math.log1p(globalComments) * 0.3;

  // Recency decay — half-life ~36h, capped so old viral posts still rank
  const ageH = (Date.now() - new Date(post.created_at).getTime()) / 36e5;
  score += Math.max(0, 4 - Math.log2(1 + ageH));

  // Tiny noise so ties don't always render in the same order
  score += Math.random() * 0.05;

  return score;
};

export const rankPosts = <T extends { id: string; user_id: string; content?: string | null; created_at: string; view_count?: number | null }>(
  posts: T[],
  aff: UserAffinity,
  likeCounts: Map<string, number>,
  commentCounts: Map<string, number>,
): T[] => {
  return [...posts].sort(
    (a, b) =>
      scorePost(b, aff, likeCounts.get(b.id) || 0, commentCounts.get(b.id) || 0) -
      scorePost(a, aff, likeCounts.get(a.id) || 0, commentCounts.get(a.id) || 0),
  );
};