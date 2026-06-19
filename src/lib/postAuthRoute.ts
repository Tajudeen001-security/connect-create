import { supabase } from "@/integrations/supabase/client";

/**
 * Decide where to send the user after authentication completes.
 * - Brand-new / OTP-just-verified users with no profile or missing required
 *   fields go to `/edit-profile` so they finish onboarding.
 * - Returning users with a complete profile go straight to `/`.
 */
export async function routeAfterAuth(userId: string): Promise<string> {
  try {
    const { data, error } = await (supabase as any)
      .from("profiles")
      .select("first_name,last_name,username,onboarded_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return "/edit-profile";
    const complete = Boolean(
      (data.first_name && data.last_name) ||
      data.onboarded_at,
    );
    return complete ? "/" : "/edit-profile";
  } catch {
    return "/";
  }
}
