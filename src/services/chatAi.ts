// Shared helpers for invoking JagX AI inside chats.
// Trigger syntax (case-insensitive):
//   "@JagxAI <question>"       → text reply
//   "/imagine <prompt>"        → image reply (uploaded to storage)
//   "@JagxAI image: <prompt>"  → image reply
import { supabase } from "@/integrations/supabase/client";
import { generateChatReply, generateImage } from "./aiService";

export const AI_USER_ID = "00000000-0000-0000-0000-00000000a1ai";
export const AI_DISPLAY_NAME = "JagX Buddy AI";

export type AiTrigger =
  | { kind: "text"; prompt: string }
  | { kind: "image"; prompt: string }
  | null;

export function parseAiTrigger(text: string): AiTrigger {
  const t = text.trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  if (lower.startsWith("/imagine")) {
    const prompt = t.slice("/imagine".length).trim();
    if (prompt) return { kind: "image", prompt };
  }
  if (lower.startsWith("@jagxai")) {
    const rest = t.slice("@jagxai".length).trim().replace(/^[:,-]\s*/, "");
    const imgMatch = rest.match(/^image\s*[:\-]\s*(.+)$/i);
    if (imgMatch) return { kind: "image", prompt: imgMatch[1].trim() };
    if (rest) return { kind: "text", prompt: rest };
  }
  return null;
}

/** Convert a data: URL to a Blob (browser). */
function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(",");
  const mime = /data:([^;]+);/.exec(head)?.[1] || "image/png";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Generate an image via gemini-ai and upload to the `posts` storage bucket.
 *  Returns the public URL. */
export async function generateAndStoreImage(prompt: string, ownerId: string): Promise<string> {
  const dataUrl = await generateImage(prompt);
  const blob = dataUrlToBlob(dataUrl);
  const ext = blob.type.includes("png") ? "png" : "jpg";
  const path = `${ownerId}/ai/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("posts").upload(path, blob, { contentType: blob.type });
  if (error) throw new Error(error.message);
  const { data: { publicUrl } } = supabase.storage.from("posts").getPublicUrl(path);
  return publicUrl;
}

/** Run the AI for a text prompt with short context. */
export async function runAiText(prompt: string, history: { role: "user" | "model"; text: string }[] = []) {
  const messages = [...history.slice(-6), { role: "user" as const, text: prompt }];
  return generateChatReply(messages, "You are JagX Buddy AI in a chat. Be friendly, helpful, 1-3 sentences. Emojis allowed.");
}

export { generateChatReply, generateImage };