"use client";

import { createClient } from "@/lib/supabase/client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

// Cloudflare Turnstile widget — rendered only when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set
const TURNSTILE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

function TurnstileWidget({ onVerified }: { onVerified: (token: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const rendered = useRef(false);

  useEffect(() => {
    if (!TURNSTILE_KEY || rendered.current || !ref.current) return;
    rendered.current = true;

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      (window as unknown as Record<string, unknown>).turnstile?.render(ref.current, {
        sitekey: TURNSTILE_KEY,
        theme: "dark",
        callback: onVerified,
      });
    };
    document.head.appendChild(script);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!TURNSTILE_KEY) return null;
  return <div ref={ref} style={{ marginBottom: 12 }} />;
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const supabase = createClient();
  const searchParams = useSearchParams();

  const handleTurnstileVerified = useCallback((token: string) => {
    setTurnstileToken(token);
  }, []);

  useEffect(() => {
    if (searchParams.get("error") === "auth_failed") {
      setError("Link expired or invalid. Please try again.");
    }
  }, [searchParams]);

  const loginWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  };

  const loginWithEmail = async () => {
    if (!email.trim()) return;
    setLoading(true);
    setError("");

    // Verify Turnstile token if configured
    if (TURNSTILE_KEY) {
      if (!turnstileToken) {
        setError("Please complete the bot check.");
        setLoading(false);
        return;
      }
      const res = await fetch("/api/auth/verify-turnstile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: turnstileToken }),
      });
      const data = await res.json() as { success: boolean };
      if (!data.success) {
        setError("Bot check failed. Please refresh and try again.");
        setLoading(false);
        return;
      }
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
    else setSent(true);
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#000", color: "#f5f5f7",
      fontFamily: "-apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "0 32px",
    }}>
      <div style={{ fontSize: 56, marginBottom: 20 }}>💸</div>
      <h1 style={{
        fontSize: 34, fontWeight: 800, letterSpacing: -0.5, marginBottom: 8,
        background: "linear-gradient(135deg, #f5f5f7 0%, rgba(255,255,255,0.5) 100%)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
      }}>BetOnMe</h1>
      <p style={{ fontSize: 16, color: "rgba(255,255,255,0.4)", marginBottom: 48, textAlign: "center" }}>
        Stake real money on your habits
      </p>

      {sent ? (
        <div style={{
          textAlign: "center", padding: "28px 24px",
          background: "rgba(52,211,153,0.06)", borderRadius: 20,
          border: "1px solid rgba(52,211,153,0.15)", maxWidth: 320, width: "100%",
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📬</div>
          <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Check your email</p>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)" }}>
            We sent a magic link to <strong>{email}</strong>
          </p>
        </div>
      ) : (
        <div style={{ width: "100%", maxWidth: 320 }}>
          {/* Google */}
          <button onClick={loginWithGoogle} style={{
            width: "100%", padding: "15px 20px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.05)", color: "#f5f5f7", fontSize: 15, fontWeight: 600,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            fontFamily: "inherit", marginBottom: 12,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "16px 0" }}>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.2)" }}>or</span>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
          </div>

          {/* Email */}
          <input
            type="email" placeholder="your@email.com" value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && loginWithEmail()}
            style={{
              width: "100%", padding: "15px 16px", borderRadius: 14, marginBottom: 10,
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
              color: "#f5f5f7", fontSize: 16, fontFamily: "inherit", outline: "none",
            }}
          />
          <TurnstileWidget onVerified={handleTurnstileVerified} />
          <button onClick={loginWithEmail} disabled={loading} style={{
            width: "100%", padding: 16, borderRadius: 14, border: "none",
            background: email.trim() ? "linear-gradient(135deg, #34d399, #10b981)" : "rgba(255,255,255,0.05)",
            color: email.trim() ? "#000" : "rgba(255,255,255,0.2)",
            fontSize: 15, fontWeight: 700, cursor: email.trim() ? "pointer" : "default",
            fontFamily: "inherit",
          }}>
            {loading ? "Sending..." : "Send magic link"}
          </button>

          {error && (
            <p style={{
              marginTop: 14, fontSize: 13, color: "#ef4444",
              textAlign: "center", padding: "10px 14px",
              background: "rgba(239,68,68,0.08)", borderRadius: 10,
            }}>{error}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "rgba(255,255,255,0.3)", fontFamily: "sans-serif" }}>Loading...</span>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
