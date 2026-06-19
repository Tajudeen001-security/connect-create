// Subscribe / unsubscribe FCM tokens to a topic via the IID API.
// Auth: any signed-in user may sub/unsub their OWN tokens.
//       Admins may pass arbitrary tokens or user_ids.
//
// Body: { topic, action?: "subscribe"|"unsubscribe", tokens?, user_ids? }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SERVICE_ACCOUNT_RAW = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") ?? "";

function b64url(bytes: Uint8Array | string): string {
  const s = typeof bytes === "string" ? btoa(bytes) : btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function pemToPkcs8(pem: string): Uint8Array {
  const b = pem.replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(b);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let cached: { token: string; expiresAt: number } | null = null;
async function getAccessToken(): Promise<string> {
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;
  if (!SERVICE_ACCOUNT_RAW) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON not set");
  const sa = JSON.parse(SERVICE_ACCOUNT_RAW);
  sa.private_key = String(sa.private_key).replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
  }));
  const input = `${header}.${claim}`;
  const key = await crypto.subtle.importKey(
    "pkcs8", pemToPkcs8(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(input),
  ));
  const jwt = `${input}.${b64url(sig)}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${await res.text()}`);
  const data = await res.json();
  cached = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cached.token;
}

const VALID_TOPIC = /^[a-zA-Z0-9_.~%-]{1,200}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), {
    status: s, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing Authorization" }, 401);
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: ud, error: ue } = await userClient.auth.getUser();
    if (ue || !ud.user) return json({ error: "Unauthorized" }, 401);
    const user = ud.user;

    const body = await req.json().catch(() => ({}));
    const topic = typeof body.topic === "string" ? body.topic.trim() : "";
    const action = body.action === "unsubscribe" ? "unsubscribe" : "subscribe";
    const explicitTokens: string[] = Array.isArray(body.tokens) ? body.tokens : [];
    const userIds: string[] = Array.isArray(body.user_ids) ? body.user_ids : [];

    if (!topic || !VALID_TOPIC.test(topic)) return json({ error: "invalid topic" }, 400);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const wantsPrivileged = explicitTokens.length > 0 ||
      userIds.some((id) => id !== user.id);
    if (wantsPrivileged) {
      const { data: isAdmin } = await admin.rpc("has_role", {
        _user_id: user.id, _role: "admin",
      });
      if (!isAdmin) return json({ error: "Forbidden" }, 403);
    }

    let tokens: string[] = [];
    if (explicitTokens.length > 0) {
      tokens = explicitTokens;
    } else {
      const ids = userIds.length > 0 ? userIds : [user.id];
      const { data } = await admin.from("push_tokens").select("token").in("user_id", ids);
      tokens = (data ?? []).map((r: { token: string }) => r.token);
    }
    tokens = Array.from(new Set(tokens.filter(Boolean)));
    if (tokens.length === 0) return json({ ok: true, count: 0, note: "no tokens" });

    const accessToken = await getAccessToken();
    const endpoint = action === "subscribe"
      ? `https://iid.googleapis.com/iid/v1:batchAdd`
      : `https://iid.googleapis.com/iid/v1:batchRemove`;

    // IID batch accepts up to 1000 tokens.
    const chunks: string[][] = [];
    for (let i = 0; i < tokens.length; i += 1000) chunks.push(tokens.slice(i, i + 1000));

    let success = 0; let failure = 0; const errors: string[] = [];
    for (const chunk of chunks) {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          access_token_auth: "true",
        },
        body: JSON.stringify({
          to: `/topics/${topic}`,
          registration_tokens: chunk,
        }),
      });
      const text = await r.text();
      if (!r.ok) { failure += chunk.length; errors.push(text); continue; }
      try {
        const data = JSON.parse(text);
        for (const res of (data.results ?? [])) {
          if (res.error) { failure++; errors.push(res.error); } else { success++; }
        }
      } catch {
        success += chunk.length;
      }
    }

    return json({ ok: true, action, topic, count: tokens.length, success, failure, errors: errors.slice(0, 5) });
  } catch (e) {
    console.error("[push-subscribe] error:", e);
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
