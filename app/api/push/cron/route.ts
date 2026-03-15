import { createClient as createServiceClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { NextResponse } from "next/server";

webpush.setVapidDetails(
  process.env.VAPID_EMAIL!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

export async function GET(request: Request) {
  // Protect with secret so only Vercel Cron can call this
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("CRON_SECRET not configured");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use service role to bypass RLS and access all users' data
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const todayStr = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  // Get all users with active subscriptions
  const { data: subs } = await supabase.from("push_subscriptions").select("user_id, subscription");
  if (!subs?.length) return NextResponse.json({ sent: 0 });

  let sent = 0;
  const results = await Promise.allSettled(
    subs.map(async ({ user_id, subscription }) => {
      // Count undone habits for this user today
      const { data: habits } = await supabase.from("habits").select("id").eq("user_id", user_id);
      if (!habits?.length) return;

      const { data: entries } = await supabase.from("habit_entries")
        .select("habit_id")
        .eq("date", todayStr)
        .eq("completed", true)
        .in("habit_id", habits.map(h => h.id));

      const doneCount = entries?.length ?? 0;
      const totalCount = habits.length;
      if (doneCount === totalCount) return; // all done, no reminder needed

      const remaining = totalCount - doneCount;
      const payload = JSON.stringify({
        title: "BetOnMe 💸",
        body: `${remaining} bet${remaining > 1 ? "s" : ""} at risk today. Don't lose your money!`,
        tag: "daily-reminder",
        url: "/dashboard",
      });

      const sub = JSON.parse(subscription);
      await webpush.sendNotification(sub, payload);
      sent++;
    })
  );

  const failed = results.filter(r => r.status === "rejected").length;
  return NextResponse.json({ sent, failed });
}
