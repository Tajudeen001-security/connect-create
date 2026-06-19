// AI Service — calls the secure `gemini-ai` Supabase Edge Function.
// The Gemini API key never touches the browser.
import { supabase } from "@/integrations/supabase/client";

async function callGemini(payload) {
  const { data, error } = await supabase.functions.invoke("gemini-ai", { body: payload });
  if (error) throw new Error(error.message || "AI request failed");
  if (data?.error) throw new Error(data.error);
  return data;
}

/** Returns the generated text as a plain string. */
export const generateCaption = async (prompt) => {
  const data = await callGemini({ mode: "text", prompt, contentType: "caption" });
  return data.text;
};

export const generatePost = async (prompt) => {
  const data = await callGemini({ mode: "text", prompt, contentType: "post" });
  return data.text;
};

/** Conversational reply for chat. `messages` is an array of {role, text}. */
export const generateChatReply = async (messages, system) => {
  const data = await callGemini({ mode: "chat", messages, system, contentType: "reply" });
  return data.text;
};

/** Returns an image as a data: URL — ready to <img src=...> or upload. */
export const generateImage = async (prompt) => {
  const data = await callGemini({ mode: "image", prompt });
  return data.imageUrl;
};
