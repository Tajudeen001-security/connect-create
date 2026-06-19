import { useEffect, useRef, useState } from "react";

const EXPIRES_SEC = 600;   // Supabase email OTPs default to 1 hour, but we surface a tighter UX window.
const RESEND_SEC = 60;

/**
 * Tracks OTP send/expire state for a single email flow.
 * `markSent()` is called after a successful send/resend.
 * Returns `expiresIn` (countdown until code is treated as stale) and
 * `resendIn` (cooldown before user is allowed to ask for a new code).
 */
export function useOtpTimer() {
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (sentAt == null) return;
    timer.current = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (timer.current != null) window.clearInterval(timer.current);
    };
  }, [sentAt]);

  const elapsed = sentAt == null ? 0 : Math.floor((now - sentAt) / 1000);
  const expiresIn = sentAt == null ? 0 : Math.max(0, EXPIRES_SEC - elapsed);
  const resendIn = sentAt == null ? 0 : Math.max(0, RESEND_SEC - elapsed);

  return {
    expiresIn,
    resendIn,
    expired: sentAt != null && expiresIn === 0,
    canResend: sentAt == null || resendIn === 0,
    markSent: () => setSentAt(Date.now()),
    reset: () => setSentAt(null),
  };
}

export function formatCountdown(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
