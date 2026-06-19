// Edge-rendered share preview for user profiles.
// Mounted at https://jagx-buddy-connect.name.ng/u/:username via vercel.json rewrite.
import { createClient } from "npm:@supabase/supabase-js@2";

const SITE = "https://jagx-buddy-connect.name.ng";
const FALLBACK_IMG = `${SITE}/og-image.jpg`;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function esc(s: string | null | undefined) {
  return (s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const handle = (url.searchParams.get("u") ?? url.pathname.split("/").pop() ?? "").replace(/^@/, "");
  const ua = req.headers.get("user-agent") ?? "";
  const isBot = /bot|crawl|spider|facebookexternalhit|whatsapp|twitter|slack|discord|linkedin|googlebot|bingbot|telegrambot/i.test(ua);
  if (!handle) return new Response("Missing username", { status: 400 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id, username, display_name, avatar_url, banner_url, bio, is_verified")
    .eq("username", handle)
    .maybeSingle();
  if (!profile) return new Response("Profile not found", { status: 404 });

  const [{ count: followers }, { count: following }, { count: postCount }] = await Promise.all([
    supabase.from("followers").select("id", { count: "exact", head: true }).eq("following_id", profile.user_id),
    supabase.from("followers").select("id", { count: "exact", head: true }).eq("follower_id", profile.user_id),
    supabase.from("posts").select("id", { count: "exact", head: true }).eq("user_id", profile.user_id),
  ]);

  const title = `@${profile.username} on JagX Buddy Connect`;
  const desc = (profile.bio || `${profile.display_name || profile.username} — ${followers ?? 0} followers · ${postCount ?? 0} posts on JagX Buddy Connect`).slice(0, 200);
  const img = profile.avatar_url || profile.banner_url || FALLBACK_IMG;
  const canonical = `${SITE}/u/${profile.username}`;
  const spaUrl = `${SITE}/user/${profile.user_id}`;
  const redirect = isBot ? "" : `<script>setTimeout(()=>location.replace(${JSON.stringify(spaUrl)}),150)</script>`;

  const html = `<!doctype html>
<html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}"/>
<link rel="canonical" href="${canonical}"/>
<meta property="og:type" content="profile"/>
<meta property="og:site_name" content="JagX Buddy Connect"/>
<meta property="og:title" content="${esc(title)}"/>
<meta property="og:description" content="${esc(desc)}"/>
<meta property="og:url" content="${canonical}"/>
<meta property="og:image" content="${esc(img)}"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="630"/>
<meta property="profile:username" content="${esc(profile.username || "")}"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${esc(title)}"/>
<meta name="twitter:description" content="${esc(desc)}"/>
<meta name="twitter:image" content="${esc(img)}"/>
<style>body{font-family:system-ui;background:#0a0a0a;color:#f5e9c8;margin:0;padding:24px;max-width:680px;margin-inline:auto}a{color:#d4af37}img.av{width:96px;height:96px;border-radius:50%;border:2px solid #d4af37;object-fit:cover}.cta{display:inline-block;margin-top:16px;background:linear-gradient(135deg,#d4af37,#f5e9c8);color:#0a0a0a;padding:12px 20px;border-radius:12px;font-weight:700;text-transform:uppercase;font-size:12px;letter-spacing:.1em;text-decoration:none}.stat{display:inline-block;margin-right:20px}.stat b{color:#d4af37}</style>
${redirect}
</head><body>
<h1 style="font-style:italic;color:#d4af37">JagX Buddy Connect</h1>
${profile.avatar_url ? `<img class="av" src="${esc(profile.avatar_url)}" alt="${esc(profile.display_name||profile.username||"")}"/>` : ""}
<h2>@${esc(profile.username)}${profile.is_verified ? " ✓" : ""}</h2>
${profile.display_name ? `<p style="color:#aaa">${esc(profile.display_name)}</p>` : ""}
${profile.bio ? `<p>${esc(profile.bio)}</p>` : ""}
<p><span class="stat"><b>${postCount ?? 0}</b> Posts</span><span class="stat"><b>${followers ?? 0}</b> Followers</span><span class="stat"><b>${following ?? 0}</b> Following</span></p>
<a class="cta" href="${esc(spaUrl)}">Open profile →</a>
</body></html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=60, s-maxage=300",
      "x-robots-tag": "index, follow",
    },
  });
});