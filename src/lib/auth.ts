import { supabase } from "@/integrations/supabase/client";
import { AuthError } from "@supabase/supabase-js";

export interface AuthResponse {
  success: boolean;
  error?: string;
  message?: string;
}

export interface SignUpData {
  email?: string;
  phone?: string;
  password: string;
  username: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  dateOfBirth: string;
  sex: "male" | "female" | "other";
  country: string;
  region?: string;
  city?: string;
  address?: string;
}

/**
 * Sign up with email and OTP verification
 */
export async function signUpWithEmail(
  email: string,
  password: string,
  signupData: Partial<SignUpData>
): Promise<AuthResponse> {
  try {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: signupData.username,
          display_name: signupData.username,
          first_name: signupData.firstName,
          last_name: signupData.lastName,
          middle_name: signupData.middleName,
          date_of_birth: signupData.dateOfBirth,
          sex: signupData.sex,
          country: signupData.country,
          region: signupData.region,
          city: signupData.city,
          address: signupData.address,
        },
      },
    });

    if (error) throw error;
    return { success: true, message: "Verification email sent" };
  } catch (error) {
    return {
      success: false,
      error: error instanceof AuthError ? error.message : String(error),
    };
  }
}

/**
 * Sign up with phone and OTP verification
 */
export async function signUpWithPhone(
  phone: string,
  password: string,
  signupData: Partial<SignUpData>
): Promise<AuthResponse> {
  try {
    const { error } = await supabase.auth.signUp({
      phone,
      password,
      options: {
        data: {
          username: signupData.username,
          display_name: signupData.username,
          first_name: signupData.firstName,
          last_name: signupData.lastName,
          middle_name: signupData.middleName,
          date_of_birth: signupData.dateOfBirth,
          sex: signupData.sex,
          country: signupData.country,
          region: signupData.region,
          city: signupData.city,
          address: signupData.address,
        },
      },
    });

    if (error) throw error;
    return { success: true, message: "OTP sent to your phone" };
  } catch (error) {
    return {
      success: false,
      error: error instanceof AuthError ? error.message : String(error),
    };
  }
}

/**
 * Verify OTP for email
 */
export async function verifyEmailOTP(
  email: string,
  token: string
): Promise<AuthResponse> {
  try {
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: token.replace(/\D/g, "").slice(-6),
      type: "email",
    });

    if (error) throw error;
    return { success: true, message: "Email verified successfully" };
  } catch (error) {
    return {
      success: false,
      error: error instanceof AuthError ? error.message : String(error),
    };
  }
}

/**
 * Verify OTP for phone
 */
export async function verifyPhoneOTP(
  phone: string,
  token: string
): Promise<AuthResponse> {
  try {
    const { error } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: "sms",
    });

    if (error) throw error;
    return { success: true, message: "Phone verified successfully" };
  } catch (error) {
    return {
      success: false,
      error: error instanceof AuthError ? error.message : String(error),
    };
  }
}

/**
 * Sign in with email and password
 */
export async function signInWithEmail(
  email: string,
  password: string
): Promise<AuthResponse> {
  try {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    return { success: true, message: "Signed in successfully" };
  } catch (error) {
    return {
      success: false,
      error: error instanceof AuthError ? error.message : String(error),
    };
  }
}

/**
 * Sign in with phone OTP
 */
export async function signInWithPhoneOTP(
  phone: string
): Promise<AuthResponse> {
  try {
    const { error } = await supabase.auth.signInWithOtp({
      phone,
    });

    if (error) throw error;
    return { success: true, message: "OTP sent to your phone" };
  } catch (error) {
    return {
      success: false,
      error: error instanceof AuthError ? error.message : String(error),
    };
  }
}

/**
 * Sign in with email OTP (forgot password)
 */
export async function signInWithEmailOTP(
  email: string
): Promise<AuthResponse> {
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
      },
    });

    if (error) throw error;
    return { success: true, message: "Verification email sent" };
  } catch (error) {
    return {
      success: false,
      error: error instanceof AuthError ? error.message : String(error),
    };
  }
}

/**
 * Sign in with Google OAuth
 */
export async function signInWithGoogle(): Promise<AuthResponse> {
  try {
    const redirectUrl = import.meta.env.VITE_APP_URL || window.location.origin;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${redirectUrl}/auth`,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });

    if (error) throw error;
    return { success: true, message: "Redirecting to Google..." };
  } catch (error) {
    return {
      success: false,
      error: error instanceof AuthError ? error.message : String(error),
    };
  }
}

/**
 * Sign in with X (Twitter) OAuth
 */
export async function signInWithX(): Promise<AuthResponse> {
  try {
    const redirectUrl = import.meta.env.VITE_APP_URL || window.location.origin;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "twitter",
      options: {
        redirectTo: `${redirectUrl}/auth`,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });

    if (error) throw error;
    return { success: true, message: "Redirecting to X..." };
  } catch (error) {
    return {
      success: false,
      error: error instanceof AuthError ? error.message : String(error),
    };
  }
}

/**
 * Update password
 */
export async function updatePassword(newPassword: string): Promise<AuthResponse> {
  try {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) throw error;
    return { success: true, message: "Password updated successfully" };
  } catch (error) {
    return {
      success: false,
      error: error instanceof AuthError ? error.message : String(error),
    };
  }
}

/**
 * Reset password via email
 */
export async function resetPasswordEmail(email: string): Promise<AuthResponse> {
  try {
    const redirectUrl = import.meta.env.VITE_APP_URL || window.location.origin;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${redirectUrl}/auth?mode=update-password`,
    });

    if (error) throw error;
    return { success: true, message: "Password reset email sent" };
  } catch (error) {
    return {
      success: false,
      error: error instanceof AuthError ? error.message : String(error),
    };
  }
}

/**
 * Sign out
 */
export async function signOut(): Promise<AuthResponse> {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return { success: true, message: "Signed out successfully" };
  } catch (error) {
    return {
      success: false,
      error: error instanceof AuthError ? error.message : String(error),
    };
  }
}

/**
 * Persist profile data to database
 */
export async function persistProfileData(
  userId: string,
  profileData: Partial<SignUpData> & {
    detectedIp?: string;
    detectedCountry?: string;
  }
): Promise<AuthResponse> {
  try {
    const { error } = await supabase.from("profiles").upsert(
      {
        user_id: userId,
        first_name: profileData.firstName,
        last_name: profileData.lastName,
        middle_name: profileData.middleName,
        date_of_birth: profileData.dateOfBirth,
        sex: profileData.sex,
        country: profileData.country,
        region: profileData.region,
        city: profileData.city,
        address: profileData.address,
        signup_ip: profileData.detectedIp,
        signup_country: profileData.detectedCountry,
        last_known_country: profileData.detectedCountry,
        country_locked: !!profileData.detectedCountry,
        location: [profileData.city, profileData.country]
          .filter(Boolean)
          .join(", ") || null,
      },
      { onConflict: "user_id" }
    );

    if (error) throw error;
    return { success: true, message: "Profile saved successfully" };
  } catch (error) {
    return {
      success: false,
      error: error instanceof AuthError ? error.message : String(error),
    };
  }
}
