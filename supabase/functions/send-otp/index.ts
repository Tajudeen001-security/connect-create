// Custom 6-digit OTP sender — codes are prefixed JAGX- or JRI- so they're
// recognizable in the recipient's inbox (e.g. "JAGX-483920").
// Stores a SHA-256 hash of the code in public.otp_codes and emails the
// plaintext code via Resend (RESEND_API_KEY).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SITE = "https://jagx-buddy-connect.name.ng";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function genCode() {
  // 6 digits, zero-padded
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, "0");
}

async function sendEmail(to: string, subject: string, html: string) {
  const RESEND = Deno.env.get("RESEND_API_KEY");
  if (!RESEND) {
    console.warn("RESEND_API_KEY not set — OTP not emailed. Returning dev mode.");
    return { devMode: true };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "JagX Buddy Connect <noreply@jagx-buddy-connect.name.ng>",
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error("Resend error:", res.status, t);
    // Domain not verified yet — surface a clear error so the UI can show a helpful message.
    throw new Error(
      "Email sender domain (jagx-buddy-connect.name.ng) is not verified in Resend yet. " +
      "Verify it at https://resend.com/domains, then retry.",
    );
  }
  return { devMode: false };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const purpose = String(body.purpose ?? "");
    const metadata = body.metadata ?? {};
    if (!email || !["signup", "reset", "verify"].includes(purpose)) {
      return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    // For reset, the user must exist; for signup they must NOT exist.
    const { data: { users } } = await admin.auth.admin.listUsers();
    const existing = users.find((u) => u.email?.toLowerCase() === email);
    if (purpose === "reset" && !existing) {
      return new Response(JSON.stringify({ error: "No account found for that email" }), { status: 404, headers: { ...corsHeaders, "content-type": "application/json" } });
    }
    if (purpose === "signup" && existing) {
      return new Response(JSON.stringify({ error: "An account with that email already exists. Please sign in." }), { status: 409, headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    // Pick prefix randomly between JAGX / JRI for branding
    const prefix = Math.random() < 0.5 ? "JAGX" : "JRI";
    const code = genCode();
    const labeled = `${prefix}-${code}`;
    const code_hash = await sha256(code);

    await admin.from("otp_codes").insert({
      email,
      code_hash,
      prefix,
      purpose,
      metadata,
    });

    const subject = purpose === "signup"
      ? `${labeled} — Your JagX Buddy verification code`
      : purpose === "reset"
        ? `${labeled} — Your JagX Buddy password reset code`
        : `${labeled} — Your JagX verification code`;

    const html = `
<div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;background:#0a0a0a;color:#f5e9c8;padding:32px;max-width:560px;margin:auto;border:1px solid #2a2a2a;border-radius:16px">
  <h1 style="font-style:italic;color:#d4af37;margin:0 0 12px">JagX Buddy Connect</h1>
  <p style="color:#ccc;margin:0 0 24px">Use this 6-digit code to ${purpose === "signup" ? "verify your new account" : purpose === "reset" ? "reset your password" : "verify your action"}:</p>
  <div style="font-size:36px;letter-spacing:8px;font-weight:800;background:linear-gradient(135deg,#d4af37,#f5e9c8);color:#0a0a0a;padding:18px 24px;border-radius:12px;text-align:center;font-family:ui-monospace,monospace">${labeled}</div>
  <p style="color:#888;margin:24px 0 0;font-size:13px">The code expires in 15 minutes. If you didn't request this, ignore this email.</p>
  <p style="color:#666;font-size:11px;margin-top:24px">JagX Buddy Connect · ${SITE} · powered by JRI License</p>
</div>`;

    const result = await sendEmail(email, subject, html);

    return new Response(JSON.stringify({
      ok: true,
      prefix,
      ...(result.devMode ? { devCode: labeled } : {}),
    }), { headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
});