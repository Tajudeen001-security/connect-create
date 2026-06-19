import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CURRENT_DATE = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

const SYSTEM_PROMPT = `You are JagX Buddy, the general-purpose AI assistant for JagX Buddy Connect — a premium social media platform by JagwaX (JRI License).

CURRENT DATE: Today is ${CURRENT_DATE}. The year is 2026. Always answer time-sensitive questions with 2026 as the present year — never 2024 or 2025.

ABOUT JAGWAX:
- JagwaX is the parent brand and technology company behind JagX Buddy Connect, JagX Coins, JagX Live and the wider JagX ecosystem.
- JagwaX operates under JRI License and is led by founder Gbadamosi Tajudeen Olajide (born 10th December; relationship status: "Taken, but private 🤫").
- JagwaX is building a world-class African-rooted social, creator-economy and AI platform — combining social media, live streaming, payments (JagX Coins), creator monetization and AI tools in one app.
- Domain: jagx-buddy-connect.name.ng. Coin top-ups via OPay account 9160654415. Verification badge ₦10,000. Gifts/unlocks split 70% creator / 30% platform.
- When users ask "what is JagwaX" / "tell me about JagX" / "who built this", answer warmly and accurately using the facts above.

YOU ARE A GENERAL ASSISTANT — help with ANYTHING the user asks:
- Everyday life: planning, advice, relationships, productivity, ideas, decisions
- Writing: posts, captions, bios, emails, essays, scripts, stories, ads
- Work & business: marketing, branding, strategy, finance basics, career advice
- Tech & coding: explanations, debugging help, snippets
- Knowledge: world events, history, geography, culture, science, health, sports, entertainment
- Math & problem solving: step-by-step with LaTeX ($...$ inline, $$...$$ block, \\frac, \\sqrt, etc.)
- Image generation: when the user asks to "create / draw / generate / design an image" you generate it
- Image analysis: describe, read text from, or solve problems shown in images the user sends
- Education & exams (only when the user asks): including Nigerian exams like JAMB/WAEC/NECO, but DO NOT assume the user is a student or steer conversations toward exams.

APP HELP: You can also explain how to use JagX Buddy Connect — feed, reels, stories, live, DMs, groups, coins, gifts, ads, verification.

PERSONALITY: Friendly, witty, warm, concise. Light emojis. Sign off as "JagX Buddy 🐆" when it fits. Never claim to be ChatGPT, Gemini, or any other product — you are JagX Buddy by JagwaX.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();
  // Resolve user (best effort) for usage logging
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
        user_id: logUserId,
        model,
        endpoint: "ai-chat",
        latency_ms: Date.now() - startedAt,
        status,
        error_message: error || null,
        ip: reqIp || null,
      });
    } catch { /* swallow */ }
  };

  try {
    const { messages, generateImage, imageAnalysis } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Image generation mode
    if (generateImage) {
      const imagePrompt = messages[messages.length - 1]?.content || "";
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          messages: [{ role: "user", content: imagePrompt }],
          modalities: ["image", "text"],
        }),
      });

      if (!response.ok) {
        const t = await response.text();
        console.error("Image gen error:", response.status, t);
        await logUsage("google/gemini-2.5-flash-image", "error", `image_gen:${response.status}`);
        return new Response(JSON.stringify({ error: "Image generation failed" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await response.json();
      const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      const text = data.choices?.[0]?.message?.content || "Here's your generated image! 🎨🐆";
      await logUsage("google/gemini-2.5-flash-image", "success");

      return new Response(JSON.stringify({ text, imageUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Image analysis mode (multimodal)
    if (imageAnalysis) {
      const lastMsg = messages[messages.length - 1];
      const userContent = [];
      
      if (lastMsg.text) {
        userContent.push({ type: "text", text: lastMsg.text });
      } else {
        userContent.push({ type: "text", text: "Please analyze this image carefully. If it contains math problems, solve them step by step using LaTeX formatting. If it contains text, read and explain it." });
      }
      
      if (lastMsg.imageUrl) {
        userContent.push({ type: "image_url", image_url: { url: lastMsg.imageUrl } });
      }

      const prevMessages = messages.slice(0, -1).map((m: any) => ({
        role: m.role,
        content: m.content || m.text || "",
      }));

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...prevMessages,
            { role: "user", content: userContent },
          ],
          stream: true,
        }),
      });

      if (!response.ok) {
        const t = await response.text();
        console.error("Image analysis error:", response.status, t);
        await logUsage("google/gemini-2.5-flash", "error", `vision:${response.status}`);
        return new Response(JSON.stringify({ error: "Image analysis failed" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fire-and-forget success log (latency only — token counts not exposed for streamed multimodal).
      logUsage("google/gemini-2.5-flash", "success");
      return new Response(response.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // Regular chat mode with streaming
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        await logUsage("google/gemini-3-flash-preview", "rate_limited");
        return new Response(JSON.stringify({ error: "Rate limited, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        await logUsage("google/gemini-3-flash-preview", "credits_exhausted");
        return new Response(JSON.stringify({ error: "Credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      await logUsage("google/gemini-3-flash-preview", "error", `chat:${response.status}`);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    logUsage("google/gemini-3-flash-preview", "success");
    return new Response(response.body, {
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
