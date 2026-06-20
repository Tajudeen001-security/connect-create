// JagX Buddy AI — calls Google Gemini directly with the user-provided
// GEMINI_API_KEY. No fallback to the Lovable AI Gateway: if the key is
// missing or invalid, we return a clear error so the caller can fix it.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

const TEXT_MODEL = "gemini-1.5-flash-latest";
const IMAGE_MODEL = "gemini-2.0-flash-exp-image-generation";

function validateGeminiApiKey(apiKey: string | undefined): { valid: boolean; error?: string } {
  if (!apiKey) return { valid: false, error: "GEMINI_API_KEY is not configured" };
  if (apiKey.startsWith("ya29.") || apiKey.startsWith("AQ.")) {
    return { valid: false, error: "OAuth token detected. Use a Gemini API key from Google AI Studio (starts with 'AIza')." };
  }
  if (!apiKey.startsWith("AIza")) {
    return { valid: false, error: "Invalid Gemini API key format. Keys start with 'AIza'." };
  }
  return { valid: true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();
  const auth = req.headers.get("Authorization") || "";
  const fwd = req.headers.get("x-forwarded-for") || "";
  const reqIp = fwd.split(",")[0].trim();
  let logUserId: string | null = null;
  if (auth.startsWith("Bearer ")) {
    try {
      const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: auth } } });
      const { data } = await sb.auth.getUser(auth.replace("Bearer ", ""));
      logUserId = data?.user?.id ?? null;
    } catch { /* ignore */ }
  }
  const logUsage = async (model: string, status: string, error?: string) => {
    if (!logUserId) return;
    try {
      const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await svc.from("ai_api_usage").insert({
        user_id: logUserId, model, endpoint: "ai-chat",
        latency_ms: Date.now() - startedAt, status,
        error_message: error || null, ip: reqIp || null,
      });
    } catch { /* swallow */ }
  };

  try {
    // Guard against empty body / non-JSON callers.
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
    const { messages = [], generateImage, imageAnalysis } = body;

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const v = validateGeminiApiKey(GEMINI_API_KEY);
    if (!v.valid) {
      await logUsage("gemini", "config_error", v.error);
      return new Response(JSON.stringify({ error: v.error }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Image generation ---
    if (generateImage) {
      const prompt = messages[messages.length - 1]?.content || "";
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
          }),
        },
      );
      const data = await r.json();
      if (!r.ok) {
        await logUsage(IMAGE_MODEL, "error", data?.error?.message);
        return new Response(JSON.stringify({ error: data?.error?.message || "Image generation failed" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const imgPart = parts.find((p: any) => p.inlineData);
      const textPart = parts.find((p: any) => p.text)?.text || "Here's your generated image! 🎨🐆";
      if (!imgPart?.inlineData?.data) {
        await logUsage(IMAGE_MODEL, "error", "no image returned");
        return new Response(JSON.stringify({ error: "No image returned" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const imageUrl = `data:${imgPart.inlineData.mimeType || "image/png"};base64,${imgPart.inlineData.data}`;
      await logUsage(IMAGE_MODEL, "success");
      return new Response(JSON.stringify({ text: textPart, imageUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build Gemini contents from chat messages.
    const contents: any[] = [];
    if (imageAnalysis) {
      const last = messages[messages.length - 1] || {};
      const prev = messages.slice(0, -1).map((m: any) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content || m.text || "" }],
      }));
      contents.push(...prev);
      const userParts: any[] = [{ text: last.text || last.content || "Analyze this image." }];
      if (last.imageUrl && typeof last.imageUrl === "string") {
        const m = last.imageUrl.match(/^data:(.+?);base64,(.+)$/);
        if (m) userParts.push({ inlineData: { mimeType: m[1], data: m[2] } });
      }
      contents.push({ role: "user", parts: userParts });
    } else {
      for (const m of messages) {
        contents.push({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content || m.text || "" }],
        });
      }
    }

    // Stream text response as SSE (OpenAI-compatible delta chunks) so the
    // existing client (`aiService.js` / AIChatPage) keeps working unchanged.
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents,
        }),
      },
    );

    if (!r.ok) {
      const t = await r.text();
      await logUsage(TEXT_MODEL, "error", `chat:${r.status}:${t.slice(0, 200)}`);
      const status = r.status === 429 ? 429 : r.status === 402 ? 402 : 500;
      const msg = r.status === 429 ? "Rate limited, please try again later."
        : r.status === 402 ? "Gemini quota / billing issue on your key."
        : "Gemini API error";
      return new Response(JSON.stringify({ error: msg }), {
        status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Transform Gemini SSE → OpenAI SSE deltas the frontend already parses.
    const stream = new ReadableStream({
      async start(ctrl) {
        const reader = r.body!.getReader();
        const dec = new TextDecoder();
        const enc = new TextEncoder();
        let buf = "";
        const emit = (text: string) => {
          const payload = { choices: [{ delta: { content: text } }] };
          ctrl.enqueue(enc.encode(`data: ${JSON.stringify(payload)}\n\n`));
        };
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const lines = buf.split("\n");
            buf = lines.pop() || "";
            for (const line of lines) {
              const t = line.trim();
              if (!t.startsWith("data:")) continue;
              const p = t.slice(5).trim();
              if (!p) continue;
              try {
                const obj = JSON.parse(p);
                const text = obj?.candidates?.[0]?.content?.parts?.map((x: any) => x.text || "").join("") || "";
                if (text) emit(text);
              } catch { /* ignore */ }
            }
          }
          ctrl.enqueue(enc.encode("data: [DONE]\n\n"));
        } catch (e) {
          ctrl.error(e);
        } finally {
          ctrl.close();
        }
      },
    });

    logUsage(TEXT_MODEL, "success");
    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    await logUsage("unknown", "error", e instanceof Error ? e.message : "unknown");
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
