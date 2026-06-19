import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const TEXT_MODEL = "gemini-1.5-flash";
const IMAGE_MODEL = "gemini-2.5-flash-image-preview";

type Body = {
  mode: "text" | "image" | "chat";
  prompt?: string;
  system?: string;
  messages?: { role: "user" | "model"; text: string }[];
  contentType?: "caption" | "post" | "reply";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as Body;
    const { mode } = body;

    if (mode === "image") {
      const prompt = (body.prompt || "").trim();
      if (!prompt) throw new Error("prompt required");
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ["IMAGE"] },
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error?.message || "Image generation failed");
      const part = data?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
      if (!part?.inlineData?.data) throw new Error("No image returned");
      const dataUrl = `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`;
      return new Response(JSON.stringify({ imageUrl: dataUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // text / chat
    const system =
      body.system ||
      (body.contentType === "reply"
        ? "You are JagX Buddy AI inside a chat. Reply naturally in 1-3 sentences. Be warm, witty, helpful. Emojis allowed."
        : "You are JagX Buddy AI, a creative social media content generator. Fun, positive, emoji-friendly. 1-3 sentences max.");

    const contents = body.messages?.length
      ? body.messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] }))
      : [{ role: "user", parts: [{ text: body.prompt || "" }] }];

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
      }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error?.message || "AI request failed");
    const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") || "";
    if (!text) throw new Error("Empty AI response");
    return new Response(JSON.stringify({ text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});