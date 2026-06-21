import { createClient } from "npm:@supabase/supabase-js@2";

const SITE = "https://jagx-buddy-connect.name.ng";
const FALLBACK_IMG = `${SITE}/og-image.jpg`;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
);

function esc(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function absoluteUrl(url: string | null | undefined) {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${SITE}${url.startsWith("/") ? "" : "/"}${url}`;
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);

    const id =
      url.searchParams.get("id") ||
      url.pathname.split("/").filter(Boolean).pop();

    if (!id) {
      return new Response("Missing post id", { status: 400 });
    }

    const ua = req.headers.get("user-agent") ?? "";

    const isBot =
      /bot|crawl|spider|facebookexternalhit|whatsapp|twitter|slack|discord|linkedin|googlebot|bingbot|telegrambot/i.test(
        ua,
      );

    const { data: post, error: postError } = await supabase
      .from("posts")
      .select(
        "id, user_id, content, image_url, video_url, created_at, hashtags, unlock_price",
      )
      .eq("id", id)
      .maybeSingle();

    if (postError) {
      console.error("og-post post error", postError);
      return new Response("Post lookup failed", { status: 500 });
    }

    if (!post) {
      return new Response("Post not found", {
        status: 404,
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
      });
    }

    const [{ data: profile }, { count: likeCount }, { data: comments, count: commentCount }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("username, display_name, avatar_url, is_verified")
          .eq("user_id", post.user_id)
          .maybeSingle(),
        supabase
          .from("likes")
          .select("id", { count: "exact", head: true })
          .eq("post_id", id),
        supabase
          .from("comments")
          .select("id, content, user_id, created_at", { count: "exact" })
          .eq("post_id", id)
          .order("created_at", { ascending: true })
          .limit(20),
      ]);

    let commentRows: Array<{ username: string; content: string }> = [];

    if (comments?.length) {
      const userIds = [...new Set(comments.map((comment) => comment.user_id))];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, username")
        .in("user_id", userIds);

      const profileMap = new Map(
        profiles?.map((item) => [item.user_id, item.username]) ?? [],
      );

      commentRows = comments.map((comment) => ({
        username: profileMap.get(comment.user_id) ?? "user",
        content: comment.content ?? "",
      }));
    }

    const username = profile?.username ?? "user";
    const displayName = profile?.display_name ?? username;
    const caption = String(post.content ?? "").trim();

    const imageUrl = absoluteUrl(post.image_url);
    const videoUrl = absoluteUrl(post.video_url);

    const media = imageUrl || FALLBACK_IMG;
    const isVideo = Boolean(videoUrl);

    const title = `@${username} on JagX Buddy Connect`;
    const desc = (
      caption ||
      `${displayName} shared a ${isVideo ? "video" : "post"} on JagX Buddy Connect`
    ).slice(0, 200);

    const canonical = `${SITE}/p/${id}`;
    const spaUrl = `${SITE}/post/${id}`;

    const ldJson = {
      "@context": "https://schema.org",
      "@type": "SocialMediaPosting",
      headline: desc.slice(0, 110),
      image: media,
      author: {
        "@type": "Person",
        name: displayName,
        alternateName: `@${username}`,
      },
      datePublished: post.created_at,
      interactionStatistic: [
        {
          "@type": "InteractionCounter",
          interactionType: "https://schema.org/LikeAction",
          userInteractionCount: likeCount ?? 0,
        },
        {
          "@type": "InteractionCounter",
          interactionType: "https://schema.org/CommentAction",
          userInteractionCount: commentCount ?? 0,
        },
      ],
      url: canonical,
      mainEntityOfPage: canonical,
    };

    const redirectScript = isBot
      ? ""
      : `<script>setTimeout(function(){location.replace(${JSON.stringify(
          spaUrl,
        )})},250)</script>`;

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(title)} — ${esc(desc.slice(0, 80))}</title>
<meta name="description" content="${esc(desc)}" />
<link rel="canonical" href="${esc(canonical)}" />

<meta property="og:type" content="article" />
<meta property="og:site_name" content="JagX Buddy Connect" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:url" content="${esc(canonical)}" />
<meta property="og:image" content="${esc(media)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
${isVideo ? `<meta property="og:video" content="${esc(videoUrl!)}" />` : ""}

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(desc)}" />
<meta name="twitter:image" content="${esc(media)}" />

<script type="application/ld+json">${JSON.stringify(ldJson)}</script>

<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#070707;color:#f5e9c8;margin:0;padding:24px;max-width:680px;margin-inline:auto}
a{color:#d4af37;text-decoration:none}
.card{background:#121212;border:1px solid #2a2a2a;border-radius:16px;overflow:hidden;margin-top:16px}
.meta{display:flex;align-items:center;gap:12px;padding:16px}
.avatar{width:44px;height:44px;border-radius:50%;object-fit:cover;border:1px solid #d4af37}
.uname{font-weight:700;color:#d4af37}
.media img,.media video{width:100%;display:block;background:#000}
.body{padding:16px;line-height:1.5}
.stats{display:flex;gap:16px;padding:0 16px 16px;color:#aaa;font-size:14px}
.comments{padding:0 16px 20px;border-top:1px solid #2a2a2a}
.comments h2{font-size:14px;text-transform:uppercase;letter-spacing:.15em;color:#888;margin:16px 0 8px}
.c{padding:6px 0;font-size:14px;color:#ddd}
.c b{color:#d4af37;font-weight:600;margin-right:6px}
.cta{display:inline-block;margin-top:16px;background:linear-gradient(135deg,#d4af37,#f5e9c8);color:#0a0a0a;padding:12px 20px;border-radius:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;font-size:12px}
</style>

${redirectScript}
</head>
<body>
<header>
  <h1 style="font-style:italic;color:#d4af37">JagX Buddy Connect</h1>
</header>

<article class="card">
  <div class="meta">
    ${
      profile?.avatar_url
        ? `<img class="avatar" src="${esc(
            absoluteUrl(profile.avatar_url) ?? profile.avatar_url,
          )}" alt="${esc(displayName)}" />`
        : ""
    }
    <div>
      <div class="uname">@${esc(username)}${profile?.is_verified ? " ✓" : ""}</div>
      <div style="font-size:12px;color:#888">${esc(
        new Date(post.created_at).toLocaleDateString(),
      )}</div>
    </div>
  </div>

  <div class="media">
    ${
      isVideo
        ? `<video src="${esc(videoUrl!)}" poster="${esc(
            imageUrl || FALLBACK_IMG,
          )}" controls playsinline preload="metadata"></video>`
        : imageUrl
          ? `<img src="${esc(imageUrl)}" alt="${esc(desc)}" />`
          : ""
    }
  </div>

  ${
    caption
      ? `<div class="body">${esc(caption).replace(/\n/g, "<br>")}</div>`
      : ""
  }

  <div class="stats">
    <span>❤️ ${likeCount ?? 0} likes</span>
    <span>💬 ${commentCount ?? 0} comments</span>
  </div>

  ${
    commentRows.length
      ? `<div class="comments"><h2>Comments</h2>${commentRows
          .map(
            (comment) =>
              `<div class="c"><b>@${esc(comment.username)}</b>${esc(
                comment.content,
              )}</div>`,
          )
          .join("")}</div>`
      : ""
  }
</article>

<a class="cta" href="${esc(spaUrl)}">Open in JagX Buddy Connect →</a>
</body>
</html>`;

    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=60, s-maxage=300",
        "x-robots-tag": "index, follow",
      },
    });
  } catch (error) {
    console.error("og-post fatal error", error);

    return new Response("Share preview failed", {
      status: 500,
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
    });
  }
});
      
