import { NextResponse } from "next/server";
import { rateLimit, getIp } from "@/lib/rateLimit";

export async function POST(request: Request) {
  // Rate limit: 20 verification attempts per IP per 10 minutes
  const ip = getIp(request);
  const rl = rateLimit(`turnstile:${ip}`, 20, 10 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
  }

  const { token } = await request.json();
  if (!token || typeof token !== "string") {
    return NextResponse.json({ success: false }, { status: 400 });
  }

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Turnstile not configured — allow through (dev/staging mode)
    console.warn("TURNSTILE_SECRET_KEY not set — skipping bot check");
    return NextResponse.json({ success: true });
  }

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret, response: token, remoteip: ip }),
  });

  const data = await res.json() as { success: boolean };
  return NextResponse.json({ success: data.success });
}
