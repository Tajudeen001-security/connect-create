import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { AccessToken } from "https://esm.sh/livekit-server-sdk@2.9.7?target=deno";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json();
    const room = String(body?.room || "").trim();
    let role: "publisher" | "viewer" = body?.role === "publisher" ? "publisher" : "viewer";
    const identity = String(body?.identity || user.id);
    const name = String(body?.name || "user");
    if (!room) return new Response(JSON.stringify({ error: "room required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Auto-promote accepted co-hosts to publisher. Room name pattern: "stream-<liveStreamId>"
    if (role === "viewer" && room.startsWith("stream-")) {
      const liveStreamId = room.slice("stream-".length);
      const { data: invite } = await supabase
        .from("live_co_hosts")
        .select("status")
        .eq("live_stream_id", liveStreamId)
        .eq("co_host_id", user.id)
        .eq("status", "accepted")
        .maybeSingle();
      if (invite) role = "publisher";
    }

    const apiKey = Deno.env.get("LIVEKIT_API_KEY")!;
    const apiSecret = Deno.env.get("LIVEKIT_API_SECRET")!;
    const wsUrl = Deno.env.get("LIVEKIT_WS_URL")!;

    const at = new AccessToken(apiKey, apiSecret, { identity, name, ttl: 60 * 60 * 4 });
    at.addGrant({
      room,
      roomJoin: true,
      canPublish: role === "publisher",
      canPublishData: true,
      canSubscribe: true,
    });
    const token = await at.toJwt();

    return new Response(JSON.stringify({ token, wsUrl }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});