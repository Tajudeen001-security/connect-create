import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Mail, ArrowLeft, Eye, EyeOff, Timer, RotateCw } from "lucide-react";
import { useOtpTimer, formatCountdown } from "@/hooks/useOtpTimer";
import { routeAfterAuth } from "@/lib/postAuthRoute";

type AuthMode = "login" | "signup" | "forgot";
type AuthMethod = "email";
type CodeStep = "request" | "verify";

const COUNTRIES = ["Nigeria","United States","United Kingdom","Ghana","South Africa","Kenya","Canada","Germany","France","India","Brazil","Other"];

const AuthPage = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>("login");
  const method: AuthMethod = "email";
  const signupOtp = useOtpTimer();
  const forgotOtp = useOtpTimer();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [otp, setOtp] = useState("");
  const [forgotStep, setForgotStep] = useState<CodeStep>("request");
  const [signupStep, setSignupStep] = useState<CodeStep>("request");
  const [newPassword, setNewPassword] = useState("");
  // Expanded signup profile fields
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");
  const [sex, setSex] = useState("");
  const [country, setCountry] = useState("");
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [detectedIp, setDetectedIp] = useState<string | null>(null);
  const [detectedCountry, setDetectedCountry] = useState<string | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);

  const ageFromDob = (d: string) => {
    if (!d) return 0;
    const dt = new Date(d);
    const diff = Date.now() - dt.getTime();
    return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
  };

  const detectLocation = async () => {
    setGeoLoading(true);
    try {
      const res = await fetch("https://ipapi.co/json/");
      const j = await res.json();
      if (j?.country_name) {
        setDetectedCountry(j.country_name);
        setDetectedIp(j.ip || null);
        setCountry(j.country_name);
        if (j.region) setRegion(j.region);
        if (j.city) setCity(j.city);
        toast.success(`Location detected: ${j.country_name}`);
      }
    } catch { toast.error("Couldn't auto-detect location, please pick manually"); }
    finally { setGeoLoading(false); }
  };

  const persistProfileFields = async (userId: string) => {
    await supabase.from("profiles").update({
      first_name: firstName || null,
      middle_name: middleName || null,
      last_name: lastName || null,
      date_of_birth: dob || null,
      sex: sex || null,
      country: country || detectedCountry || null,
      region: region || null,
      city: city || null,
      address: address || null,
      signup_ip: detectedIp,
      signup_country: detectedCountry,
      last_known_country: detectedCountry,
      country_locked: !!detectedCountry,
      location: [city, country].filter(Boolean).join(", ") || null,
    } as any).eq("user_id", userId);
  };

  const handleSocial = async (provider: "google") => {
  setLoading(true);
  try {
    // Use standard Supabase OAuth instead of Lovable's wrapper
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        // Redirect to the root URL; the app's ProtectedRoute will handle the rest
        redirectTo: window.location.origin, 
      },
    });
    if (error) throw error;
  } catch (e: any) {
    toast.error(e?.message || `${provider} sign-in failed`);
  } finally { 
    setLoading(false); 
  }
};

  // Email OTP via Supabase's built-in mailer — no Resend / no domain verification needed.
  // The default Supabase email template embeds a 6-digit {{ .Token }}.

  const handleForgotPassword = async () => {
    setLoading(true);
    try {
      if (forgotStep === "request") {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: false },
        });
        if (error) throw error;
        setForgotStep("verify");
        toast.success("We emailed you a 6-digit code");
      } else {
        const { error: vErr } = await supabase.auth.verifyOtp({
          email,
          token: otp.replace(/\D/g, "").slice(-6),
          type: "email",
        });
        if (vErr) throw vErr;
        // Session is now active — update password.
        const { error: uErr } = await supabase.auth.updateUser({ password: newPassword });
        if (uErr) throw uErr;
        window.dispatchEvent(new CustomEvent("welcome-back"));
        navigate("/");
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async () => {
    setLoading(true);
    try {
      if (mode === "signup") {
        if (signupStep === "request") {
          if (!password || password.length < 6) {
            throw new Error("Choose a password (min 6 chars) before we send the code");
          }
          if (!firstName || !lastName) throw new Error("First and last name are required");
          if (!dob || ageFromDob(dob) < 13) throw new Error("You must be at least 13 years old");
          if (!sex) throw new Error("Please select your sex");
          if (!country) throw new Error("Country is required — tap Auto-detect");
          const { error } = await supabase.auth.signInWithOtp({
            email,
            options: {
              shouldCreateUser: true,
              data: { username, display_name: username },
            },
          });
          if (error) throw error;
          setSignupStep("verify");
          toast.success("We emailed you a 6-digit code");
        } else {
          const { error: vErr } = await supabase.auth.verifyOtp({
            email,
            token: otp.replace(/\D/g, "").slice(-6),
            type: "email",
          });
          if (vErr) throw vErr;
          // Session active — set the chosen password so the user can use email+password later.
          const { error: uErr } = await supabase.auth.updateUser({ password });
          if (uErr) throw uErr;
          // Persist the full profile fields we collected on step 1.
          const { data: { user: u } } = await supabase.auth.getUser();
          if (u) await persistProfileFields(u.id);
          window.dispatchEvent(new CustomEvent("welcome-back", { detail: { name: username } }));
          navigate("/");
        }
      } else {
        // LOGIN mode — supports password or OTP. Existing password accounts keep
        // working; users without a password (created via OTP) can use the code path.
        if (loginMethod === "otp") {
          if (loginOtpStep === "request") {
            if (!email) throw new Error("Enter your email first");
            const { error } = await supabase.auth.signInWithOtp({
              email,
              options: { shouldCreateUser: false },
            });
            if (error) throw error;
            setLoginOtpStep("verify");
            toast.success("We emailed you a 6-digit code");
          } else {
            const { error: vErr } = await supabase.auth.verifyOtp({
              email,
              token: otp.replace(/\D/g, "").slice(-6),
              type: "email",
            });
            if (vErr) throw vErr;
            window.dispatchEvent(new CustomEvent("welcome-back"));
            navigate("/");
          }
        } else {
          const { error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) {
            // Auto-fallback: account exists but has no password (OTP-created).
            if (/invalid login credentials|invalid_credentials/i.test(error.message)) {
              toast.error("Wrong password — try a sign-in code instead", {
                action: {
                  label: "Send code",
                  onClick: () => {
                    setLoginMethod("otp");
                    setLoginOtpStep("request");
                    setOtp("");
                  },
                },
              });
              return;
            }
            throw error;
          }
          window.dispatchEvent(new CustomEvent("welcome-back"));
          navigate("/");
        }
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "forgot") return handleForgotPassword();
    handleEmailAuth();
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="p-4">
        <button onClick={() => navigate("/")} className="text-muted-foreground">
          <ArrowLeft className="size-5" />
        </button>
      </div>

      <div className="flex-1 flex flex-col justify-center px-6 pb-12">
        {/* Logo */}
        <div className="text-center mb-10">
          <h1 className="font-display italic text-4xl text-gold mb-2">JagX</h1>
          <p className="text-sm text-muted-foreground">Buddy Connect 3.0</p>
        </div>

        {mode !== "forgot" && (
          <div className="flex items-center justify-center gap-2 mb-6 py-3 rounded-xl gold-gradient text-primary-foreground text-xs font-bold uppercase tracking-widest">
            <Mail className="size-4" /> Email
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <>
              <input type="text" placeholder="Username (public handle)" value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-surface border border-border text-foreground placeholder:text-muted-foreground outline-none focus:border-primary text-sm" required />
              {signupStep === "request" && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" placeholder="First name" value={firstName} onChange={e => setFirstName(e.target.value)}
                      className="px-3 py-3 rounded-xl bg-surface border border-border text-foreground placeholder:text-muted-foreground outline-none focus:border-primary text-sm" required />
                    <input type="text" placeholder="Last name" value={lastName} onChange={e => setLastName(e.target.value)}
                      className="px-3 py-3 rounded-xl bg-surface border border-border text-foreground placeholder:text-muted-foreground outline-none focus:border-primary text-sm" required />
                  </div>
                  <input type="text" placeholder="Middle name (optional)" value={middleName} onChange={e => setMiddleName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-surface border border-border text-foreground placeholder:text-muted-foreground outline-none focus:border-primary text-sm" />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Date of birth</label>
                      <input type="date" value={dob} onChange={e => setDob(e.target.value)}
                        className="w-full px-3 py-3 rounded-xl bg-surface border border-border text-foreground outline-none focus:border-primary text-sm" required />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Sex</label>
                      <select value={sex} onChange={e => setSex(e.target.value)}
                        className="w-full px-3 py-3 rounded-xl bg-surface border border-border text-foreground outline-none focus:border-primary text-sm" required>
                        <option value="">Select…</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </div>
                  <button type="button" onClick={detectLocation} disabled={geoLoading}
                    className="w-full px-3 py-2 rounded-xl bg-surface border border-gold/30 text-gold text-xs font-bold uppercase tracking-widest disabled:opacity-50">
                    {geoLoading ? "Detecting…" : detectedCountry ? `📍 ${detectedCountry} (auto)` : "Auto-detect my location"}
                  </button>
                  <select value={country} onChange={e => setCountry(e.target.value)}
                    disabled={!!detectedCountry}
                    className="w-full px-4 py-3 rounded-xl bg-surface border border-border text-foreground outline-none focus:border-primary text-sm disabled:opacity-70" required>
                    <option value="">Country *</option>
                    {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" placeholder="Region / State" value={region} onChange={e => setRegion(e.target.value)}
                      className="px-3 py-3 rounded-xl bg-surface border border-border text-foreground placeholder:text-muted-foreground outline-none focus:border-primary text-sm" />
                    <input type="text" placeholder="City" value={city} onChange={e => setCity(e.target.value)}
                      className="px-3 py-3 rounded-xl bg-surface border border-border text-foreground placeholder:text-muted-foreground outline-none focus:border-primary text-sm" />
                  </div>
                  <input type="text" placeholder="Address (optional)" value={address} onChange={e => setAddress(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-surface border border-border text-foreground placeholder:text-muted-foreground outline-none focus:border-primary text-sm" />
                </>
              )}
            </>
          )}

          <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-surface border border-border text-foreground placeholder:text-muted-foreground outline-none focus:border-primary text-sm"
              required
              disabled={mode === "forgot" && forgotStep === "verify"}
            />

          {mode !== "forgot" && !(mode === "login" && loginMethod === "otp") && (
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-surface border border-border text-foreground placeholder:text-muted-foreground outline-none focus:border-primary text-sm pr-12"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          )}

          {((mode === "forgot" && forgotStep === "verify") ||
            (mode === "signup" && signupStep === "verify") ||
            (mode === "login" && loginMethod === "otp" && loginOtpStep === "verify")) && (
            <input
              type="text"
              placeholder="6-digit code from email"
              inputMode="numeric"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-surface border border-border text-foreground placeholder:text-muted-foreground outline-none focus:border-primary text-sm text-center tracking-[0.5em]"
              maxLength={6}
              required
            />
          )}

          {mode === "forgot" && forgotStep === "verify" && (
            <input
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-surface border border-border text-foreground placeholder:text-muted-foreground outline-none focus:border-primary text-sm"
              minLength={6}
              required
            />
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl gold-gradient text-primary-foreground text-sm font-bold uppercase tracking-widest disabled:opacity-50"
          >
            {loading
              ? "Please wait..."
              : mode === "forgot"
                ? (forgotStep === "request" ? "Send 6-digit Code" : "Verify & Reset Password")
                : mode === "login"
                  ? (loginMethod === "otp"
                      ? (loginOtpStep === "request" ? "Send 6-digit Code" : "Verify & Sign In")
                      : "Sign In")
                  : (signupStep === "request" ? "Send 6-digit Code" : "Verify & Create Account")}
          </button>
        </form>

        {/* Login helpers: switch between password and OTP, plus forgot password */}
        {mode === "login" && (
          <div className="flex items-center justify-between mt-4 text-sm">
            <button
              type="button"
              className="text-gold font-semibold"
              onClick={() => {
                if (loginMethod === "password") {
                  setLoginMethod("otp");
                  setLoginOtpStep("request");
                  setOtp("");
                } else {
                  setLoginMethod("password");
                  setLoginOtpStep("request");
                  setOtp("");
                }
              }}
            >
              {loginMethod === "password" ? "Sign in with a code" : "Use password instead"}
            </button>
            <button
              onClick={() => { setMode("forgot"); setForgotStep("request"); setOtp(""); setNewPassword(""); }}
              className="text-gold font-semibold"
              type="button"
            >
              Forgot password?
            </button>
          </div>
        )}

        {/* Toggle mode */}
        <p className="text-center text-sm text-muted-foreground mt-6">
          {mode === "forgot" ? (
            <button onClick={() => setMode("login")} className="text-gold font-semibold" type="button">
              Back to Sign In
            </button>
          ) : (
          <>
          {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
          <button
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="text-gold font-semibold"
            type="button"
          >
            {mode === "login" ? "Sign Up" : "Sign In"}
          </button>
          </>
          )}
        </p>

        {/* Social sign-in */}
        {mode !== "forgot" && (
          <div className="mt-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Or continue with</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="grid grid-cols-1 gap-2">
              <button type="button" onClick={() => handleSocial("google")} disabled={loading}
                className="flex items-center justify-center gap-2 py-3 rounded-xl bg-surface border border-border text-foreground text-xs font-bold uppercase tracking-widest disabled:opacity-50">
                <svg viewBox="0 0 24 24" className="size-4"><path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.4-1.7 4.1-5.4 4.1-3.3 0-5.9-2.7-5.9-6s2.6-6 5.9-6c1.9 0 3.1.8 3.9 1.5l2.6-2.5C16.9 3.6 14.7 2.7 12 2.7 6.9 2.7 2.8 6.8 2.8 12s4.1 9.3 9.2 9.3c5.3 0 8.8-3.7 8.8-9 0-.6 0-1-.1-1.5H12z"/></svg>
                Google
              </button>
            </div>
            <p className="text-[9px] text-muted-foreground text-center mt-3 leading-relaxed">
              By signing in you agree to our <button type="button" onClick={() => navigate("/privacy")} className="text-gold underline">Privacy Policy & Terms</button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthPage;
