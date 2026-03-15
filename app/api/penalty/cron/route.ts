import { createClient as createServiceClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { NextResponse } from "next/server";

webpush.setVapidDetails(
  process.env.VAPID_EMAIL!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("CRON_SECRET not configured");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // This cron runs at 22:00 UTC = midnight Israel / EOD for most users
  const todayStr = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  // Get all habits with stake/streak/lost data
  const { data: allHabits } = await supabase
    .from("habits")
    .select("id, user_id, name, emoji, stake, streak, lost, insured, grace_used_at");

  if (!allHabits?.length) return NextResponse.json({ penalized: 0 });

  // Get ALL habit entries for today (completed AND missed) — used for both checks
  const habitIds = allHabits.map(h => h.id);
  const { data: todayEntries } = await supabase
    .from("habit_entries")
    .select("habit_id, completed")
    .eq("date", todayStr)
    .in("habit_id", habitIds);

  const completedSet = new Set((todayEntries ?? []).filter(e => e.completed).map(e => e.habit_id));
  // alreadyProcessedSet = habits that already have ANY entry today (done OR missed)
  // If a missed entry exists, it means this cron already ran — skip to avoid double penalty
  const alreadyProcessedSet = new Set((todayEntries ?? []).map(e => e.habit_id));

  // Missed habits = not completed today AND not already processed (idempotency)
  const missedHabits = allHabits.filter(h => !completedSet.has(h.id) && !alreadyProcessedSet.has(h.id));
  if (!missedHabits.length) return NextResponse.json({ penalized: 0, date: todayStr });

  // Get push subscriptions for penalty notifications
  const userIds = [...new Set(missedHabits.map(h => h.user_id))];
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("user_id, subscription")
    .in("user_id", userIds);
  const subMap = new Map((subs ?? []).map(s => [s.user_id, s.subscription]));

  // Group missed habits by user
  const byUser = new Map<string, typeof missedHabits>();
  for (const h of missedHabits) {
    if (!byUser.has(h.user_id)) byUser.set(h.user_id, []);
    byUser.get(h.user_id)!.push(h);
  }

  let penalized = 0;

  const results = await Promise.allSettled(
    [...byUser.entries()].map(async ([user_id, missed]) => {
      const totalLost = missed.reduce((s, h) => s + h.stake, 0);

      // Process each missed habit
      await Promise.all(missed.map(async (habit) => {
        if (!habit.stake || habit.stake <= 0) return;

        // Insurance grace day: skip penalty if insured and grace not used this month
        if (habit.insured) {
          const thisMonth = todayStr.slice(0, 7); // "YYYY-MM"
          const graceMonth = habit.grace_used_at ? habit.grace_used_at.slice(0, 7) : null;
          if (graceMonth !== thisMonth) {
            // Use grace day — mark entry as completed (grace), update grace_used_at
            await supabase.from("habits").update({ grace_used_at: todayStr }).eq("id", habit.id);
            await supabase.from("habit_entries").upsert(
              { habit_id: habit.id, user_id, date: todayStr, completed: true },
              { onConflict: "habit_id,date" }
            );
            return; // no penalty applied
          }
        }

        // 1. Deduct balance atomically + log transaction
        const { error: penaltyErr } = await supabase.rpc("deduct_penalty", {
          p_user_id: user_id,
          p_habit_id: habit.id,
          p_amount: habit.stake,
          p_desc: `Missed: ${habit.emoji} ${habit.name}`,
        });
        if (penaltyErr) throw new Error(`deduct_penalty failed: ${penaltyErr.message}`);

        // 2. Reset streak, increment lost counter
        await supabase
          .from("habits")
          .update({ streak: 0, lost: (habit.lost ?? 0) + habit.stake })
          .eq("id", habit.id);

        // 3. Record missed entry so history is accurate
        await supabase.from("habit_entries").upsert(
          { habit_id: habit.id, user_id, date: todayStr, completed: false },
          { onConflict: "habit_id,date" }
        );
      }));

      penalized++;

      // Send push notification
      const rawSub = subMap.get(user_id);
      if (rawSub) {
        try {
          const dollars = (totalLost / 100).toFixed(2);
          const payload = JSON.stringify({
            title: "BetOnMe 💸 Penalty charged",
            body: `You missed ${missed.length} habit${missed.length > 1 ? "s" : ""} and lost $${dollars}. Tomorrow is a new chance!`,
            tag: "penalty",
            url: "/dashboard",
          });
          await webpush.sendNotification(JSON.parse(rawSub), payload);
        } catch {
          // Non-critical — penalty applied regardless
        }
      }
    })
  );

  const failed = results.filter(r => r.status === "rejected").length;
  return NextResponse.json({ penalized, failed, date: todayStr });
}
