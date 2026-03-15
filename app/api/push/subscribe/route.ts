import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { rateLimit, getIp } from "@/lib/rateLimit";

const MAX_ENDPOINT_LENGTH = 2048;

export async function POST(request: Request) {
  // Rate limit: 10 subscription attempts per IP per hour
  const ip = getIp(request);
  const rl = rateLimit(`push-subscribe:${ip}`, 10, 60 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many requests. Please wait." }, { status: 429 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let subscription: unknown;
  try {
    subscription = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (
    !subscription ||
    typeof subscription !== "object" ||
    !("endpoint" in subscription) ||
    typeof (subscription as Record<string, unknown>).endpoint !== "string"
  ) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  const endpoint = (subscription as Record<string, unknown>).endpoint as string;

  // Validate endpoint is a real HTTPS URL (prevents SSRF to internal services)
  if (!endpoint.startsWith("https://") || endpoint.length > MAX_ENDPOINT_LENGTH) {
    return NextResponse.json({ error: "Invalid subscription endpoint" }, { status: 400 });
  }

  const { error } = await supabase.from("push_subscriptions").upsert({
    user_id: user.id,
    endpoint,
    subscription: JSON.stringify(subscription),
  }, { onConflict: "user_id,endpoint" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let endpoint: unknown;
  try {
    ({ endpoint } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (typeof endpoint !== "string" || !endpoint.startsWith("https://")) {
    return NextResponse.json({ error: "Invalid endpoint" }, { status: 400 });
  }

  await supabase.from("push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", endpoint);
  return NextResponse.json({ ok: true });
}
