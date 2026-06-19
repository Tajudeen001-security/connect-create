// Public OpenAI-compatible chat completions endpoint for JagX developer API keys.
// Clients call:
//   POST https://<project>.supabase.co/functions/v1/ai-v1-chat
//   Authorization: Bearer jagx_live_xxxxxxxxxxxx
//   { model, messages, stream }
// Validates the user's API key against public.api_keys, then proxies the request
// to the Lovable AI Gateway using the platform's LOVABLE_API_KEY.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  // Auth via Bearer JagX key
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(jagx_live_[A-Za-z0-9_-]{16,})$/);
  if (!m) {
    return new Response(JSON.stringify({ error: { message: "Missing or invalid API key. Get one at https://jagx-buddy-connect.name.ng/developer", type: "invalid_request_error" } }), {
      status: 401, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
  const rawKey = m[1];
  const key_hash = await sha256(rawKey);

  const { data: keyRow } = await admin
    .from("api_keys")
    .select("id, user_id, revoked")
    .eq("key_hash", key_hash)
    .maybeSingle();

  if (!keyRow || keyRow.revoked) {
    return new Response(JSON.stringify({ error: { message: "Invalid or revoked API key", type: "authentication_error" } }), {
      status: 401, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  // Fire-and-forget usage bump
  admin.from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", keyRow.id)
    .then(() => {});

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: { message: "AI gateway not configured", type: "server_error" } }), {
      status: 500, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  const body = await req.json().catch(() => ({}));
  const model = body.model ?? "google/gemini-3-flash-preview";
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const stream = !!body.stream;
  const reasoning = body.reasoning;

  if (!messages.length) {
    return new Response(JSON.stringify({ error: { message: "messages[] is required", type: "invalid_request_error" } }), {
      status: 400, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  const gw = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream, ...(reasoning ? { reasoning } : {}) }),
  });

  if (!gw.ok) {
    const t = await gw.text();
    return new Response(JSON.stringify({ error: { message: t || "AI gateway error", type: "upstream_error" } }), {
      status: gw.status, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  if (stream) {
    return new Response(gw.body, { headers: { ...corsHeaders, "content-type": "text/event-stream" } });
  }
  const json = await gw.json();
  return new Response(JSON.stringify(json), { headers: { ...corsHeaders, "content-type": "application/json" } });
});