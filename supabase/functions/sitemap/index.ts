// Dynamic sitemap.xml — includes public profiles and recent posts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const origin = url.searchParams.get("origin") || `${url.protocol}//${url.host}`;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const staticRoutes = [
    { loc: "/", priority: "1.0", changefreq: "hourly" },
    { loc: "/reels", priority: "0.9", changefreq: "hourly" },
    { loc: "/discover", priority: "0.8", changefreq: "daily" },
    { loc: "/live", priority: "0.8", changefreq: "hourly" },
    { loc: "/coins", priority: "0.6", changefreq: "weekly" },
    { loc: "/ads", priority: "0.5", changefreq: "weekly" },
    { loc: "/auth", priority: "0.4", changefreq: "monthly" },
  ];

  const [{ data: profiles }, { data: posts }, { data: reels }] = await Promise.all([
    supabase.from("profiles").select("user_id, username, updated_at").limit(5000),
    supabase.from("posts").select("id, updated_at, created_at, video_url").is("video_url", null).order("created_at", { ascending: false }).limit(5000),
    supabase.from("posts").select("id, updated_at, created_at, video_url").not("video_url", "is", null).order("created_at", { ascending: false }).limit(5000),
  ]);

  const nowIso = new Date().toISOString();
  const urls: string[] = [];
  for (const r of staticRoutes) {
    urls.push(`<url><loc>${origin}${r.loc}</loc><lastmod>${nowIso}</lastmod><changefreq>${r.changefreq}</changefreq><priority>${r.priority}</priority></url>`);
  }
  for (const p of profiles || []) {
    if (!p.user_id) continue;
    const lm = p.updated_at ? new Date(p.updated_at).toISOString() : nowIso;
    urls.push(`<url><loc>${origin}/user/${p.user_id}</loc><lastmod>${lm}</lastmod><changefreq>daily</changefreq><priority>0.6</priority></url>`);
  }
  for (const p of posts || []) {
    const lm = new Date(p.updated_at || p.created_at || nowIso).toISOString();
    urls.push(`<url><loc>${origin}/post/${p.id}</loc><lastmod>${lm}</lastmod><changefreq>weekly</changefreq><priority>0.5</priority></url>`);
  }
  for (const r of reels || []) {
    const lm = new Date(r.updated_at || r.created_at || nowIso).toISOString();
    urls.push(`<url><loc>${origin}/reels?v=${r.id}</loc><lastmod>${lm}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>`);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;

  return new Response(xml, {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
});