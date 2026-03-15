import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // Content-Security-Policy: restricts what scripts/frames/connections are allowed
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Scripts: self + Privy + Google Fonts
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://auth.privy.io https://privy.io https://challenges.cloudflare.com",
      // Styles: self + inline (React inline styles) + Google Fonts
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      // Fonts: self + Google Fonts CDN
      "font-src 'self' https://fonts.gstatic.com",
      // Images: self + data URIs (avatars) + Supabase storage
      "img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in",
      // API connections: self + Supabase + Privy + Base RPC + WalletConnect
      "connect-src 'self' https://*.supabase.co https://*.supabase.in https://*.privy.io wss://*.supabase.co wss://*.privy.io https://mainnet.base.org https://base.publicnode.com https://*.walletconnect.com wss://*.walletconnect.com https://*.walletconnect.org",
      // Frames: Privy embedded wallet uses iframes across multiple subdomains
      "frame-src https://*.privy.io https://privy.io https://verify.walletconnect.com https://challenges.cloudflare.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
