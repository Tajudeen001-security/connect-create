// Sends Firebase Cloud Messaging (HTTP v1) push notifications.
//
// Targets (any one):
//   - default: caller's own tokens
//   - tokens: ["..."]            (admin)
//   - user_ids: ["uuid"]         (admin if any id !== caller)
//   - broadcast: true            (admin)
//   - topic: "group-123"         (admin)  -> /topics/<topic>
//   - condition: "'foo' in topics" (admin)
//
// Body extras: title, body, url (deep-link path), data.
// Logs every send to public.push_logs.

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
  const body = pem.replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) return cachedToken.token;
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
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.token;
}

// Allow-list deep links to match the service worker's sanitizer.
const ALLOWED_ROUTES = new Set([
  "/", "/reels", "/chat", "/profile", "/create", "/coins", "/live",
  "/discover", "/notifications", "/ai-chat", "/edit-profile", "/earnings",
  "/ads", "/admin", "/developer", "/privacy", "/terms", "/groups",
]);
const ALLOWED_PREFIXES = ["/dm/", "/user/", "/group/", "/post/", "/p/", "/g/", "/admin/"];

function sanitizeUrl(raw: unknown): string {
  if (typeof raw !== "string" || !raw) return "/";
  if (raw.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return "/";
  if (!raw.startsWith("/")) return "/";
  const path = raw.split("?")[0].split("#")[0];
  if (ALLOWED_ROUTES.has(path)) return raw;
  if (ALLOWED_PREFIXES.some((p) => path.startsWith(p) && path.length > p.length)) return raw;
  return "/";
}

const VALID_TOPIC = /^[a-zA-Z0-9_.~%-]{1,200}$/;

type TargetSpec =
  | { kind: "token"; token: string }
  | { kind: "topic"; topic: string }
  | { kind: "condition"; condition: string };

async function sendOne(
  projectId: string,
  accessToken: string,
  target: TargetSpec,
  title: string,
  body: string,
  url: string,
  data: Record<string, string> | undefined,
): Promise<{ ok: boolean; status: number; error?: string }> {
  const dataPayload: Record<string, string> = { url, ...(data ?? {}) };
  // FCM v1 requires data values to be strings.
  for (const k of Object.keys(dataPayload)) dataPayload[k] = String(dataPayload[k]);

  const message: Record<string, unknown> = {
    notification: { title, body },
    data: dataPayload,
    webpush: {
      fcm_options: { link: url },
      notification: { title, body, icon: "/image-5 (1).jpg" },
    },
  };
  if (target.kind === "token") message.token = target.token;
  else if (target.kind === "topic") message.topic = target.topic;
  else message.condition = target.condition;

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
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing Authorization" }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
    const user = userData.user;

    const body = await req.json().catch(() => ({}));
    const title = String(body.title ?? "").slice(0, 200);
    const message = String(body.body ?? "").slice(0, 1000);
    const url = sanitizeUrl(body.url);
    const data = body.data && typeof body.data === "object" ? body.data : undefined;
    const userIds: string[] = Array.isArray(body.user_ids) ? body.user_ids : [];
    const explicitTokens: string[] = Array.isArray(body.tokens) ? body.tokens : [];
    const broadcast = body.broadcast === true;
    const topic = typeof body.topic === "string" ? body.topic.trim() : "";
    const condition = typeof body.condition === "string" ? body.condition.trim() : "";

    if (!title || !message) return json({ error: "title and body are required" }, 400);
    if (topic && !VALID_TOPIC.test(topic)) return json({ error: "invalid topic name" }, 400);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const wantsPrivileged = broadcast || !!topic || !!condition ||
      explicitTokens.length > 0 ||
      userIds.some((id) => id !== user.id);
    if (wantsPrivileged) {
      const { data: isAdmin } = await admin.rpc("has_role", {
        _user_id: user.id, _role: "admin",
      });
      if (!isAdmin) return json({ error: "Forbidden" }, 403);
    }

    const sa = loadServiceAccount();
    const accessToken = await getAccessToken(sa);

    type Job = {
      target: TargetSpec;
      kind: "self" | "user" | "token" | "broadcast" | "topic" | "condition";
      recipient_user_id: string | null;
    };
    const jobs: Job[] = [];

    if (topic) {
      jobs.push({ target: { kind: "topic", topic }, kind: "topic", recipient_user_id: null });
    } else if (condition) {
      jobs.push({ target: { kind: "condition", condition }, kind: "condition", recipient_user_id: null });
    } else {
      // Resolve tokens with their owning user_id so we can log per-recipient.
      let rows: { token: string; user_id: string }[] = [];
      let kind: Job["kind"] = "self";
      if (broadcast) {
        const { data } = await admin.from("push_tokens").select("token,user_id");
        rows = data ?? [];
        kind = "broadcast";
      } else if (userIds.length > 0) {
        const { data } = await admin.from("push_tokens").select("token,user_id").in("user_id", userIds);
        rows = data ?? [];
        kind = userIds.length === 1 && userIds[0] === user.id ? "self" : "user";
      } else if (explicitTokens.length > 0) {
        const { data } = await admin.from("push_tokens").select("token,user_id").in("token", explicitTokens);
        const known = new Map((data ?? []).map((r: any) => [r.token, r.user_id]));
        rows = explicitTokens.map((t) => ({ token: t, user_id: known.get(t) ?? null as any }));
        kind = "token";
      } else {
        const { data } = await admin.from("push_tokens").select("token,user_id").eq("user_id", user.id);
        rows = data ?? [];
        kind = "self";
      }

      const seen = new Set<string>();
      for (const r of rows) {
        if (!r.token || seen.has(r.token)) continue;
        seen.add(r.token);
        jobs.push({
          target: { kind: "token", token: r.token },
          kind,
          recipient_user_id: r.user_id ?? null,
        });
      }
    }

    if (jobs.length === 0) return json({ ok: true, sent: 0, note: "no targets" });

    const results = await Promise.all(
      jobs.map((j) => sendOne(sa.project_id, accessToken, j.target, title, message, url, data)),
    );

    // Build log rows + prune dead tokens.
    const dead: string[] = [];
    const logRows = jobs.map((j, i) => {
      const r = results[i];
      if (j.target.kind === "token" && !r.ok &&
          (r.status === 404 || r.status === 400 ||
           /UNREGISTERED|INVALID_ARGUMENT|NOT_FOUND/i.test(r.error ?? ""))) {
        dead.push(j.target.token);
      }
      return {
        sender_id: user.id,
        recipient_user_id: j.recipient_user_id,
        token: j.target.kind === "token" ? j.target.token : null,
        topic: j.target.kind === "topic" ? j.target.topic
              : j.target.kind === "condition" ? j.target.condition : null,
        title, body: message, url,
        target_kind: j.kind,
        success: r.ok,
        status_code: r.status,
        error: r.ok ? null : (r.error ?? "").slice(0, 1000),
      };
    });

    // Best-effort log + prune (don't fail the request on log error).
    await admin.from("push_logs").insert(logRows).then(({ error }) => {
      if (error) console.warn("[send-push] log insert failed:", error.message);
    });
    if (dead.length > 0) {
      await admin.from("push_tokens").delete().in("token", dead);
    }

    const sent = results.filter((r) => r.ok).length;
    return json({ ok: true, sent, failed: results.length - sent, pruned: dead.length });
  } catch (e) {
    console.error("[send-push] error:", e);
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
