// Google Search Console API proxy using a service account.
// Actions: "summary" (sites + URL inspection) and "performance" (search analytics).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// --- JWT signing for Google service accounts (RS256) ---
function b64url(input: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof input === "string") bytes = new TextEncoder().encode(input);
  else if (input instanceof Uint8Array) bytes = input;
  else bytes = new Uint8Array(input);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function pemToPkcs8(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function getAccessToken(serviceAccount: any, scope: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: serviceAccount.client_email,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;

  const keyData = pemToPkcs8(serviceAccount.private_key);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${b64url(new Uint8Array(sig))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Token exchange failed: ${JSON.stringify(json)}`);
  return json.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Require an authenticated admin caller
    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userData.user.id);
    const isAdmin = roles?.some((r: any) => r.role === "admin") || userData.user.email === "jagwazorld@gmail.com";
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const action: string = body.action || "summary";
    const explicitSite: string | undefined = body.siteUrl;
    const days: number = Math.min(Math.max(Number(body.days) || 28, 1), 90);

    const saRaw = Deno.env.get("GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT");
    if (!saRaw) throw new Error("GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT not configured");
    const serviceAccount = JSON.parse(saRaw);
    const defaultSite = Deno.env.get("GOOGLE_SEARCH_CONSOLE_SITE_URL") || explicitSite || "";

    const token = await getAccessToken(
      serviceAccount,
      "https://www.googleapis.com/auth/webmasters.readonly",
    );
    const authH = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    if (action === "summary") {
      // List sites the service account can see
      const sitesRes = await fetch("https://searchconsole.googleapis.com/webmasters/v3/sites", { headers: authH });
      const sitesJson = await sitesRes.json();

      let inspection: any = null;
      if (defaultSite) {
        const inspRes = await fetch("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", {
          method: "POST",
          headers: authH,
          body: JSON.stringify({ inspectionUrl: defaultSite, siteUrl: defaultSite }),
        });
        inspection = await inspRes.json();
      }

      return new Response(JSON.stringify({
        sites: sitesJson.siteEntry || [],
        defaultSite,
        inspection,
        serviceAccountEmail: serviceAccount.client_email,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "performance") {
      const site = explicitSite || defaultSite;
      if (!site) throw new Error("siteUrl required");
      const end = new Date();
      const start = new Date(); start.setDate(end.getDate() - days);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);

      const [totalsRes, queriesRes, pagesRes] = await Promise.all([
        fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
          method: "POST", headers: authH,
          body: JSON.stringify({ startDate: fmt(start), endDate: fmt(end), dimensions: [] }),
        }),
        fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
          method: "POST", headers: authH,
          body: JSON.stringify({ startDate: fmt(start), endDate: fmt(end), dimensions: ["query"], rowLimit: 25 }),
        }),
        fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
          method: "POST", headers: authH,
          body: JSON.stringify({ startDate: fmt(start), endDate: fmt(end), dimensions: ["page"], rowLimit: 25 }),
        }),
      ]);
      const [totals, queries, pages] = await Promise.all([totalsRes.json(), queriesRes.json(), pagesRes.json()]);
      return new Response(JSON.stringify({
        site, range: { start: fmt(start), end: fmt(end), days },
        totals: totals.rows?.[0] || null,
        queries: queries.rows || [],
        pages: pages.rows || [],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "submit-sitemap") {
      const site = explicitSite || defaultSite;
      const sitemapUrl: string = body.sitemapUrl;
      if (!site || !sitemapUrl) throw new Error("siteUrl and sitemapUrl required");
      const r = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/sitemaps/${encodeURIComponent(sitemapUrl)}`, {
        method: "PUT", headers: authH,
      });
      return new Response(JSON.stringify({ ok: r.ok, status: r.status }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "sitemaps-status") {
      const site = explicitSite || defaultSite;
      if (!site) throw new Error("siteUrl required");
      const r = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/sitemaps`, { headers: authH });
      const json = await r.json();
      return new Response(JSON.stringify({ ok: r.ok, sitemaps: json.sitemap || [], raw: json }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "fetch-check") {
      // Server-side fetch of sitemap + robots from public origin (avoids CORS)
      const targets: { name: string; url: string }[] = body.targets || [];
      const results = await Promise.all(targets.map(async (t) => {
        const started = Date.now();
        try {
          const r = await fetch(t.url, { redirect: "follow" });
          const text = await r.text();
          return {
            name: t.name, url: t.url, ok: r.ok, status: r.status,
            contentType: r.headers.get("content-type"),
            bytes: text.length,
            ms: Date.now() - started,
            preview: text.slice(0, 240),
            urlCount: t.url.includes("sitemap") ? (text.match(/<url>/g)?.length || 0) : undefined,
          };
        } catch (err: any) {
          return { name: t.name, url: t.url, ok: false, status: 0, error: err?.message || String(err), ms: Date.now() - started };
        }
      }));
      return new Response(JSON.stringify({ results, checkedAt: new Date().toISOString() }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "unknown action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("search-console error:", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});