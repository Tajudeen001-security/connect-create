import { createClient } from "npm:@supabase/supabase-js@2";
import { AccessToken } from "npm:livekit-server-sdk@2.9.7";
import { corsHeaders } from "../_shared/cors.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized: missing bearer token" }, 401);
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      },
    );

    const token = authHeader.replace("Bearer ", "");

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser(token);

    if (userError || !user) {
      return json({ error: "Unauthorized: user not found" }, 401);
    }

    const body = await req.json().catch(() => ({}));

    const room = String(body?.room || "").trim();
    let role: "publisher" | "viewer" =
      body?.role === "publisher" ? "publisher" : "viewer";

    const identity = String(body?.identity || user.id);
    const name =
      String(body?.name || user.user_metadata?.username || user.email || "user")
        .trim()
        .slice(0, 80) || "user";

    if (!room) {
      return json({ error: "room required" }, 400);
    }

    if (identity !== user.id && !identity.startsWith("guest-")) {
      return json({ error: "identity mismatch" }, 403);
    }

    if (role === "publisher" && room.startsWith("stream-")) {
      const liveStreamId = room.slice("stream-".length);

      const { data: stream, error: streamError } = await userClient
        .from("live_streams")
        .select("id, user_id, is_active")
        .eq("id", liveStreamId)
        .maybeSingle();

      if (streamError) {
        return json({ error: streamError.message }, 500);
      }

      if (!stream || stream.user_id !== user.id || !stream.is_active) {
        return json({ error: "You cannot publish to this stream" }, 403);
      }
    }

    if (role === "viewer" && room.startsWith("stream-")) {
      const liveStreamId = room.slice("stream-".length);

      const { data: invite } = await userClient
        .from("live_co_hosts")
        .select("status")
        .eq("live_stream_id", liveStreamId)
        .eq("co_host_id", user.id)
        .eq("status", "accepted")
        .maybeSingle();

      if (invite) {
        role = "publisher";
      }
    }

    const livekitApiKey = Deno.env.get("LIVEKIT_API_KEY");
    const livekitApiSecret = Deno.env.get("LIVEKIT_API_SECRET");
    const livekitWsUrl = Deno.env.get("LIVEKIT_WS_URL");

    if (!livekitApiKey || !livekitApiSecret || !livekitWsUrl) {
      return json(
        {
          error:
            "LiveKit is not configured. Add LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and LIVEKIT_WS_URL.",
        },
        500,
      );
    }

    const accessToken = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity,
      name,
      ttl: 60 * 60 * 4,
    });

    accessToken.addGrant({
      room,
      roomJoin: true,
      canPublish: role === "publisher",
      canPublishData: true,
      canSubscribe: true,
    });

    const jwt = await accessToken.toJwt();

    return json({
      token: jwt,
      wsUrl: livekitWsUrl,
    });
  } catch (error) {
    console.error("livekit-token error", error);

    return json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create live token",
      },
      500,
    );
  }
});
                                      
