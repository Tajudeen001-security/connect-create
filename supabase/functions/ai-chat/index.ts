// JagX Buddy AI — uses Lovable AI Gateway (no API key from user needed).
// Falls back to a clear error if the gateway is misconfigured.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CURRENT_DATE = new Date().toLocaleDateString("en-US", {
  weekday: "long", year: "numeric", month: "long", day: "numeric",
});

const SYSTEM_PROMPT = `You are JagX Buddy, the general-purpose AI assistant for JagX Buddy Connect — a premium social media platform by JagwaX (JRI License).
CURRENT DATE: Today is ${CURRENT_DATE}. The year is 2026. Always answer time-sensitive questions with 2026 as the present year.
PERSONALITY: Friendly, witty, warm, concise. Light emojis. Sign off as "JagX Buddy 🐆" when it fits. Never claim to be ChatGPT, Gemini, or any other product — you are JagX Buddy by JagwaX.`;

const TEXT_MODEL = "google/gemini-3-flash-preview";
const IMAGE_MODEL = "google/gemini-2.5-flash-image";
const GATEWAY = "https://ai.gateway.lovable.dev/v1";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const raw = await req.text();
    if (!raw) {
      return new Response(JSON.stringify({ error: "Request body required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let body: any;
    try { body = JSON.parse(raw); } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { messages = [], generateImage } = body;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Image generation via Lovable AI Gateway (chat-completions multimodal) ---
    if (generateImage) {
      const prompt = messages[messages.length - 1]?.content || messages[messages.length - 1]?.text || "";
      const r = await fetch(`${GATEWAY}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: IMAGE_MODEL,
          messages: [{ role: "user", content: prompt }],
          modalities: ["image", "text"],
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        return new Response(JSON.stringify({ error: data?.error?.message || "Image generation failed" }), {
          status: r.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const msg = data?.choices?.[0]?.message;
      const imageUrl = msg?.images?.[0]?.image_url?.url || msg?.images?.[0]?.url;
      const text = msg?.content || "Here's your generated image! 🎨🐆";
      if (!imageUrl) {
        return new Response(JSON.stringify({ error: "No image returned" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ text, imageUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Streaming chat completion ---
    const oaiMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages.map((m: any) => ({
        role: m.role === "model" ? "assistant" : (m.role || "user"),
        content: m.content ?? m.text ?? "",
      })),
    ];

    const r = await fetch(`${GATEWAY}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: TEXT_MODEL, messages: oaiMessages, stream: true }),
    });

    if (!r.ok) {
      const t = await r.text();
      const status = r.status === 429 ? 429 : r.status === 402 ? 402 : 500;
      const msg = r.status === 429 ? "Rate limited, please try again shortly."
        : r.status === 402 ? "Lovable AI credits exhausted — add credits in workspace billing."
        : `AI gateway error: ${t.slice(0, 200)}`;
      return new Response(JSON.stringify({ error: msg }), {
        status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pass-through SSE stream (already OpenAI-compatible deltas).
    return new Response(r.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
