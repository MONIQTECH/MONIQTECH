"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export default function AuthConfirm() {
  useEffect(() => {
    const supabase = createClient();

    // Handle hash-based tokens (implicit flow)
    // Supabase with implicit flow puts access_token in the URL hash
    // We need to wait briefly for Supabase to parse it and set the session
    const hash = window.location.hash;
    if (hash.includes("access_token") || hash.includes("error")) {
      // Give Supabase SDK time to parse the hash and set session
      setTimeout(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session) {
            window.location.replace("/dashboard");
          } else {
            window.location.replace("/login?error=auth_failed");
          }
        });
      }, 500);
      return;
    }

    // Handle code in query params (PKCE flow)
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const token_hash = params.get("token_hash");
    const type = params.get("type");

    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        window.location.replace(error ? "/login?error=auth_failed" : "/dashboard");
      });
    } else if (token_hash && type) {
      supabase.auth.verifyOtp({
        token_hash,
        type: type as "email" | "magiclink" | "signup",
      }).then(({ error }) => {
        window.location.replace(error ? "/login?error=auth_failed" : "/dashboard");
      });
    } else {
      // Check if already logged in
      supabase.auth.getSession().then(({ data: { session } }) => {
        window.location.replace(session ? "/dashboard" : "/login");
      });
    }
  }, []);

  return (
    <div style={{
      minHeight: "100vh", background: "#000", display: "flex",
      alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16,
    }}>
      <div style={{ fontSize: 40 }}>💸</div>
      <p style={{
        fontFamily: "-apple-system, sans-serif", color: "rgba(255,255,255,0.4)",
        fontSize: 15,
      }}>Signing you in...</p>
    </div>
  );
}
