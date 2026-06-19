// AI Service — calls the secure `ai-chat` Supabase Edge Function which
// proxies to the Lovable AI Gateway. The API key never reaches the browser.
//
// Migrated from Gemini direct → Lovable AI (`google/gemini-3-flash-preview`).
// The previous `gemini-ai` function is kept for backward compatibility but
// no longer called from app code.
import { supabase } from "@/integrations/supabase/client";

async function callAiChat({ messages, generateImage = false }) {
  const session = (await supabase.auth.getSession()).data.session;
  const url = `${import.meta.env.VITE_SUPABASE_URL || "https://fwjxhozxlucaywpavznu.supabase.co"}/functions/v1/ai-chat`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "",
    },
    body: JSON.stringify({ messages, generateImage }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`AI error ${res.status}: ${txt || res.statusText}`);
  }
  return res;
}

// Read a streamed SSE response and concatenate the assistant text.
async function readStreamedText(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let out = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const obj = JSON.parse(payload);
        const delta = obj.choices?.[0]?.delta?.content ?? obj.choices?.[0]?.message?.content ?? "";
        if (delta) out += delta;
      } catch {
        /* ignore non-JSON chunks */
      }
    }
  }
  return out.trim();
}

async function chat(messages) {
  const res = await callAiChat({ messages });
  // ai-chat returns a streamed SSE body for chat mode.
  return readStreamedText(res);
}

/** Conversational reply. `messages` is an array of {role, text} from old code. */
export const generateChatReply = async (messages, system) => {
  const mapped = (messages || []).map((m) => ({
    role: m.role === "model" ? "assistant" : m.role,
    content: m.text ?? m.content ?? "",
  }));
  if (system) mapped.unshift({ role: "system", content: system });
  return chat(mapped);
};

export const generateCaption = async (prompt) =>
  generateChatReply([{ role: "user", text: prompt }],
    "You are JagX Buddy AI, a social media caption writer. Reply with ONE punchy caption, no preamble.");

export const generatePost = async (prompt) =>
  generateChatReply([{ role: "user", text: prompt }],
    "You are JagX Buddy AI. Write a short, vivid social media post. 1-3 sentences max.");

/** Returns an image URL (data URL or remote) ready for <img src=...>. */
export const generateImage = async (prompt) => {
  const res = await callAiChat({ messages: [{ role: "user", content: prompt }], generateImage: true });
  const data = await res.json();
  if (!data.imageUrl) throw new Error("No image returned");
  return data.imageUrl;
};
