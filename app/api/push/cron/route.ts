import { createClient } from "@/lib/supabase/server";
import webpush from "web-push";
import { NextResponse } from "next/server";

webpush.setVapidDetails(
  process.env.VAPID_EMAIL!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

export async function GET(request: Request) {
  // Protect with secret so only Vercel Cron can call this
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
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
