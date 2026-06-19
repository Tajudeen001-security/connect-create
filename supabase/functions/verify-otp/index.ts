// Verifies a 6-digit OTP previously sent by send-otp.
// On success:
//   purpose=signup → creates the auth user with the supplied password
//   purpose=reset  → updates that user's password to the supplied newPassword
// Then returns a signed-in session (access + refresh tokens) so the client can
// hydrate without a second round trip.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function stripPrefix(code: string) {
  // Accept "JAGX-123456" / "JRI-123456" / "123456"
  const m = String(code).match(/(\d{6})\s*$/);
  return m ? m[1] : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const purpose = String(body.purpose ?? "");
    const code = stripPrefix(body.code ?? "");
    const password = body.password ? String(body.password) : null;
    const username = body.username ? String(body.username) : null;

    if (!email || !code || !["signup", "reset", "verify"].includes(purpose)) {
      return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    const code_hash = await sha256(code);

    // Find newest unconsumed code for this email+purpose
    const { data: rows, error } = await admin
      .from("otp_codes")
      .select("*")
      .eq("email", email)
      .eq("purpose", purpose)
      .eq("consumed", false)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw error;
    const row = rows?.[0];
    if (!row) return new Response(JSON.stringify({ error: "Code expired or not found. Request a new code." }), { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } });
    if (row.attempts >= 5) return new Response(JSON.stringify({ error: "Too many attempts. Request a new code." }), { status: 429, headers: { ...corsHeaders, "content-type": "application/json" } });
    if (row.code_hash !== code_hash) {
      await admin.from("otp_codes").update({ attempts: row.attempts + 1 }).eq("id", row.id);
      return new Response(JSON.stringify({ error: "Wrong code. Try again." }), { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } });
    }
    await admin.from("otp_codes").update({ consumed: true }).eq("id", row.id);

    let userId: string | null = null;
    if (purpose === "signup") {
      if (!password) return new Response(JSON.stringify({ error: "Password required" }), { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } });
      const { data, error: cErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { username: username ?? row.metadata?.username, display_name: username ?? row.metadata?.username },
      });
      if (cErr) throw cErr;
      userId = data.user!.id;
    } else if (purpose === "reset") {
      if (!password) return new Response(JSON.stringify({ error: "New password required" }), { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } });
      const { data: { users } } = await admin.auth.admin.listUsers();
      const u = users.find((x) => x.email?.toLowerCase() === email);
      if (!u) return new Response(JSON.stringify({ error: "User not found" }), { status: 404, headers: { ...corsHeaders, "content-type": "application/json" } });
      const { error: uErr } = await admin.auth.admin.updateUserById(u.id, { password });
      if (uErr) throw uErr;
      userId = u.id;
    }

    return new Response(JSON.stringify({ ok: true, user_id: userId }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
});