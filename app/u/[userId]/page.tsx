import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

const fmt = (cents: number) => {
  const abs = Math.abs(cents);
  const dollars = abs / 100;
  return `$${dollars % 1 === 0 ? dollars.toFixed(0) : dollars.toFixed(2)}`;
};

export async function generateMetadata({ params }: { params: Promise<{ userId: string }> }): Promise<Metadata> {
  const { userId } = await params;
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .single();
  const name = profile?.display_name || "Someone";
  return {
    title: `${name}'s Habits — BetOnMe`,
    description: `${name} is betting real money on their habits. Check their streak on BetOnMe.`,
    openGraph: { title: `${name} is betting on themselves`, description: "See their habits and streaks on BetOnMe." },
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PublicProfilePage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;

  // Reject non-UUID paths immediately — prevents enumeration attempts and
  // avoids hitting Supabase with garbage inputs
  if (!UUID_RE.test(userId)) notFound();

  const supabase = await createClient();

  const [{ data: profile }, { data: habits }] = await Promise.all([
    supabase.from("profiles").select("display_name, avatar_color, avatar_url, created_at").eq("id", userId).single(),
    supabase.from("habits").select("id, name, emoji, stake, streak, saved, lost, insured").eq("user_id", userId).order("created_at"),
  ]);

  if (!profile) notFound();

  const name = profile.display_name || "Anonymous";
  const memberYear = new Date(profile.created_at).getFullYear();
  const totalSaved = (habits ?? []).reduce((s, h) => s + (h.saved ?? 0), 0);
  const bestStreak = Math.max(0, ...(habits ?? []).map(h => h.streak ?? 0));
  const winRate = habits?.length
    ? Math.round((habits.filter(h => (h.streak ?? 0) > 0).length / habits.length) * 100)
    : 0;
  const avatarLetter = name[0]?.toUpperCase() || "?";
  const avatarColor = profile.avatar_color || "#34d399";

  return (
    <div style={{
      minHeight: "100dvh", background: "#000", color: "#f5f5f7",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "0 0 40px",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { display: none; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.6; } }
      `}</style>

      {/* Header */}
      <div style={{
        width: "100%", maxWidth: 430, padding: "56px 20px 0",
        animation: "fadeUp 0.5s ease both",
      }}>
        {/* Logo */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 36 }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 2, color: "rgba(255,255,255,0.25)", textTransform: "uppercase" }}>
            BetOnMe
          </div>
        </div>

        {/* Avatar + Name */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 32 }}>
          <div style={{
            width: 80, height: 80, borderRadius: "50%", marginBottom: 14,
            background: profile.avatar_url ? "transparent" : avatarColor,
            backgroundImage: profile.avatar_url ? `url(${profile.avatar_url})` : undefined,
            backgroundSize: "cover", backgroundPosition: "center",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 32, fontWeight: 700, color: "#000",
            boxShadow: `0 0 0 3px rgba(255,255,255,0.06), 0 0 40px ${avatarColor}33`,
          }}>
            {!profile.avatar_url && avatarLetter}
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: "#f5f5f7", marginBottom: 4 }}>{name}</h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>BetOnMe member since {memberYear}</p>
        </div>

        {/* Stats row */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
          gap: 10, marginBottom: 28,
          animation: "fadeUp 0.5s 0.1s ease both",
        }}>
          {[
            { label: "Best Streak", val: `${bestStreak}d`, color: "#f59e0b" },
            { label: "Total Saved", val: fmt(totalSaved), color: "#34d399" },
            { label: "Win Rate", val: `${winRate}%`, color: "#3b82f6" },
          ].map(s => (
            <div key={s.label} style={{
              background: "rgba(255,255,255,0.04)", borderRadius: 16,
              padding: "14px 0", textAlign: "center",
              border: "1px solid rgba(255,255,255,0.06)",
            }}>
              <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: s.color, marginBottom: 4 }}>{s.val}</p>
              <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 1, textTransform: "uppercase" }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Habits */}
        <p style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.3)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>
          Active Habits
        </p>

        {!habits?.length ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: "rgba(255,255,255,0.2)", fontSize: 14 }}>
            No habits yet
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 32 }}>
            {habits.map((h, i) => (
              <div key={h.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                background: "rgba(255,255,255,0.04)", borderRadius: 18,
                padding: "16px 18px",
                border: "1px solid rgba(255,255,255,0.06)",
                animation: `fadeUp 0.4s ${0.15 + i * 0.06}s ease both`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <span style={{ fontSize: 26 }}>{h.emoji}</span>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                      <p style={{ fontSize: 15, fontWeight: 600, color: "#f5f5f7" }}>{h.name}</p>
                      {h.insured && <span style={{ fontSize: 11 }}>🛡️</span>}
                    </div>
                    <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
                      {fmt(h.stake)}/day · {h.streak > 0 ? `🔥 ${h.streak}d streak` : "No streak yet"}
                    </p>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 700, color: "#34d399" }}>{fmt(h.saved ?? 0)}</p>
                  <p style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>saved</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CTA */}
        <a href="https://betonme.vercel.app" style={{
          display: "block", width: "100%", padding: 17, borderRadius: 18,
          background: "linear-gradient(135deg, #34d399, #10b981)",
          color: "#000", fontSize: 16, fontWeight: 700, textAlign: "center",
          textDecoration: "none", letterSpacing: 0.2,
          animation: "fadeUp 0.5s 0.4s ease both",
        }}>
          Start betting on yourself →
        </a>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", textAlign: "center", marginTop: 14 }}>
          BetOnMe — put money on your habits
        </p>
      </div>
    </div>
  );
}
