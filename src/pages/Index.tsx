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

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);

    const username =
      url.searchParams.get("username") ||
      url.pathname.split("/").filter(Boolean).pop();

    if (!username) {
      return new Response("Missing username", { status: 400 });
    }

    const { data: profile, error } = await supabase
      .from("profiles")
      .select(
        "user_id, username, display_name, bio, avatar_url, is_verified, created_at",
      )
      .eq("username", username)
      .maybeSingle();

    if (error) {
      console.error("og-profile lookup error", error);
      return new Response("Profile lookup failed", { status: 500 });
    }

    if (!profile) {
      return new Response("Profile not found", { status: 404 });
    }

    const title = `${profile.display_name || profile.username} (@${profile.username})`;
    const desc =
      profile.bio ||
      `View ${profile.display_name || profile.username}'s profile on JagX Buddy Connect.`;

    const image = profile.avatar_url || FALLBACK_IMG;
    const canonical = `${SITE}/u/${profile.username}`;
    const appUrl = `${SITE}/user/${profile.user_id}`;

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(title)} — JagX Buddy Connect</title>
<meta name="description" content="${esc(desc)}" />
<link rel="canonical" href="${esc(canonical)}" />

<meta property="og:type" content="profile" />
<meta property="og:site_name" content="JagX Buddy Connect" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:url" content="${esc(canonical)}" />
<meta property="og:image" content="${esc(image)}" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(desc)}" />
<meta name="twitter:image" content="${esc(image)}" />

<script>setTimeout(function(){location.replace(${JSON.stringify(appUrl)})},250)</script>
</head>
<body style="background:#070707;color:#f5e9c8;font-family:system-ui;padding:24px">
<h1 style="color:#d4af37">${esc(title)}${profile.is_verified ? " ✓" : ""}</h1>
<p>${esc(desc)}</p>
<a style="color:#d4af37" href="${esc(appUrl)}">Open profile</a>
</body>
</html>`;

    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=60, s-maxage=300",
      },
    });
  } catch (error) {
    console.error("og-profile fatal error", error);
    return new Response("Profile preview failed", { status: 500 });
  }
});
                          
