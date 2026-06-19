// Sends Firebase Cloud Messaging (HTTP v1) push notifications to tokens
// stored in public.push_tokens.
//
// Auth: requires a logged-in user. Only admins (public.has_role(uid,'admin'))
// may target other users or broadcast. Any user can send a test to themselves.
//
// Body:
// {
//   "title": "Hello",
//   "body":  "World",
//   "url":   "/notifications",      // optional click target
//   "data":  { "k": "v" },          // optional FCM data payload
//   "user_ids": ["uuid", ...] |     // optional explicit targets
//   "tokens":   ["fcm-token", ...] | // optional explicit tokens
//   "broadcast": true                // optional, admin only
// }
// If none of user_ids/tokens/broadcast are provided, sends to the caller.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SERVICE_ACCOUNT_RAW = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") ?? "";

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

function loadServiceAccount(): ServiceAccount {
  if (!SERVICE_ACCOUNT_RAW) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON not set");
  const sa = JSON.parse(SERVICE_ACCOUNT_RAW);
  if (!sa.project_id || !sa.client_email || !sa.private_key) {
    throw new Error("Service account missing required fields");
  }
  // Handle escaped newlines.
  sa.private_key = String(sa.private_key).replace(/\\n/g, "\n");
  return sa;
}

function b64url(bytes: Uint8Array | string): string {
  const s = typeof bytes === "string"
    ? btoa(bytes)
    : btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
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

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) {
    return cachedToken.token;
  }
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const signingInput = `${header}.${claim}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  ));
  const jwt = `${signingInput}.${b64url(sig)}`;

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
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.token;
}

async function sendOne(
  projectId: string,
  accessToken: string,
  token: string,
  title: string,
  body: string,
  url: string | undefined,
  data: Record<string, string> | undefined,
): Promise<{ ok: boolean; status: number; error?: string }> {
  const message: Record<string, unknown> = {
    token,
    notification: { title, body },
    webpush: {
      fcm_options: url ? { link: url } : undefined,
      notification: { title, body, icon: "/placeholder.svg" },
    },
  };
  if (data) message.data = data;

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
    },
  );
  if (res.ok) return { ok: true, status: res.status };
  const text = await res.text();
  return { ok: false, status: res.status, error: text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing Authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = userData.user;

    const body = await req.json().catch(() => ({}));
    const title = String(body.title ?? "").slice(0, 200);
    const message = String(body.body ?? "").slice(0, 1000);
    const url = body.url ? String(body.url).slice(0, 500) : undefined;
    const data = body.data && typeof body.data === "object" ? body.data : undefined;
    const userIds: string[] = Array.isArray(body.user_ids) ? body.user_ids : [];
    const explicitTokens: string[] = Array.isArray(body.tokens) ? body.tokens : [];
    const broadcast = body.broadcast === true;

    if (!title || !message) {
      return new Response(JSON.stringify({ error: "title and body are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Admin check for targeting other users / broadcast.
    const wantsPrivileged = broadcast ||
      userIds.some((id) => id !== user.id) ||
      explicitTokens.length > 0;
    if (wantsPrivileged) {
      const { data: isAdmin } = await admin.rpc("has_role", {
        _user_id: user.id,
        _role: "admin",
      });
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Resolve tokens.
    let tokens: string[] = [];
    if (broadcast) {
      const { data } = await admin.from("push_tokens").select("token");
      tokens = (data ?? []).map((r: { token: string }) => r.token);
    } else if (userIds.length > 0) {
      const { data } = await admin.from("push_tokens").select("token").in("user_id", userIds);
      tokens = (data ?? []).map((r: { token: string }) => r.token);
    } else if (explicitTokens.length > 0) {
      tokens = explicitTokens;
    } else {
      const { data } = await admin.from("push_tokens").select("token").eq("user_id", user.id);
      tokens = (data ?? []).map((r: { token: string }) => r.token);
    }

    tokens = Array.from(new Set(tokens.filter(Boolean)));
    if (tokens.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, note: "no tokens" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sa = loadServiceAccount();
    const accessToken = await getAccessToken(sa);

    const results = await Promise.all(
      tokens.map((t) => sendOne(sa.project_id, accessToken, t, title, message, url, data)),
    );

    // Remove invalid/unregistered tokens.
    const dead: string[] = [];
    results.forEach((r, i) => {
      if (!r.ok && (r.status === 404 || r.status === 400 || /UNREGISTERED|INVALID_ARGUMENT/i.test(r.error ?? ""))) {
        dead.push(tokens[i]);
      }
    });
    if (dead.length > 0) {
      await admin.from("push_tokens").delete().in("token", dead);
    }

    const sent = results.filter((r) => r.ok).length;
    return new Response(
      JSON.stringify({ ok: true, sent, failed: results.length - sent, pruned: dead.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[send-push] error:", e);
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
