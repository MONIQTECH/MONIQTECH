"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

const fmt = (cents: number) => {
  const abs = Math.abs(cents);
  const dollars = abs / 100;
  return `${cents < 0 ? "-" : ""}$${dollars % 1 === 0 ? dollars.toFixed(0) : dollars.toFixed(2)}`;
};

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Haptic feedback — works on Android + PWA, silent on iOS (no error)
const haptic = (pattern: number | number[]) => {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(pattern);
  }
};

const AVATAR_COLORS = [
  "linear-gradient(135deg,#34d399,#3b82f6)",
  "linear-gradient(135deg,#f59e0b,#ef4444)",
  "linear-gradient(135deg,#a78bfa,#ec4899)",
  "linear-gradient(135deg,#06b6d4,#6366f1)",
  "linear-gradient(135deg,#f97316,#eab308)",
  "linear-gradient(135deg,#10b981,#14b8a6)",
];

// Quick habit templates
const TEMPLATES = [
  { name: "Wake up at 6am", emoji: "⏰" },
  { name: "Read 30 minutes", emoji: "📖" },
  { name: "Morning workout", emoji: "🏃" },
  { name: "No social media", emoji: "🚫" },
  { name: "Drink 2L water", emoji: "💧" },
  { name: "Meditate 10 min", emoji: "🧘" },
  { name: "No sugar", emoji: "🍭" },
  { name: "Cold shower", emoji: "🚿" },
  { name: "Sleep by 11pm", emoji: "💤" },
  { name: "Workout", emoji: "💪" },
];

type Habit = {
  id: string; name: string; emoji: string; stake: number;
  done: boolean; streak: number; history: number[];
  saved: number; lost: number; deadline: string;
};

// ─── Sheet ────────────────────────────────────────────────────────────────────
function Sheet({ show, onClose, children }: { show: boolean; onClose: () => void; children: React.ReactNode }) {
  const [closing, setClosing] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const startX = useRef(0);
  const dragY = useRef(0);
  const dragging = useRef(false);

  const close = useCallback(() => {
    haptic(8);
    setClosing(true);
    setTimeout(() => { onClose(); setClosing(false); }, 300);
  }, [onClose]);

  const onTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
    startX.current = e.touches[0].clientX;
    dragY.current = 0;
    dragging.current = false;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const dy = e.touches[0].clientY - startY.current;
    const dx = Math.abs(e.touches[0].clientX - startX.current);
    if (!dragging.current && Math.abs(dy) < 5 && dx < 5) return;
    if (!dragging.current) {
      if (dx > Math.abs(dy)) return;
      dragging.current = true;
    }
    const clamped = Math.max(0, dy);
    dragY.current = clamped;
    if (sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${clamped}px)`;
      sheetRef.current.style.transition = "none";
    }
  };

  const onTouchEnd = () => {
    if (!dragging.current) return;
    if (dragY.current > 80) {
      if (sheetRef.current) sheetRef.current.style.transform = `translateY(100%)`;
      close();
    } else {
      if (sheetRef.current) {
        sheetRef.current.style.transition = "transform 0.3s cubic-bezier(.32,.72,.24,1)";
        sheetRef.current.style.transform = "translateY(0)";
      }
    }
    dragging.current = false;
    dragY.current = 0;
  };

  if (!show && !closing) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      display: "flex", alignItems: "flex-end", justifyContent: "center",
      background: "rgba(0,0,0,0.6)", backdropFilter: "blur(12px)",
      animation: closing ? "fadeBgOut .3s ease forwards" : "fadeBgIn .25s ease",
    }} onClick={close}>
      <div
        ref={sheetRef}
        onClick={e => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          background: "#1c1c1e", borderRadius: "22px 22px 0 0",
          width: "100%", maxWidth: 420, maxHeight: "90vh", overflowY: "auto",
          touchAction: "pan-y",
          animation: closing ? "sheetDown .3s cubic-bezier(.32,.72,.24,1) forwards" : "sheetUp .35s cubic-bezier(.32,.72,.24,1)",
        }}
      >
        <div style={{ padding: "14px 22px 0", cursor: "grab" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.18)", margin: "0 auto 20px" }} />
        </div>
        <div style={{ padding: "0 22px 40px" }}>{children}</div>
      </div>
    </div>
  );
}

// ─── Confetti ─────────────────────────────────────────────────────────────────
function Confetti({ show }: { show: boolean }) {
  const colors = ["#34d399", "#3b82f6", "#f59e0b", "#ec4899", "#a78bfa", "#f97316", "#fff"];
  if (!show) return null;
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 1500, overflow: "hidden" }}>
      {Array.from({ length: 70 }).map((_, i) => {
        const color = colors[i % colors.length];
        const left = `${5 + (i / 70) * 90 + (Math.sin(i * 2.3) * 8)}%`;
        const delay = `${(i / 70) * 0.6}s`;
        const size = 5 + (i % 5) * 2;
        const dur = `${1.4 + (i % 4) * 0.2}s`;
        const rot = i % 2 === 0 ? "540deg" : "-360deg";
        return (
          <div key={i} style={{
            position: "absolute", bottom: 0, left,
            width: size, height: i % 3 === 0 ? size * 0.4 : size,
            borderRadius: i % 3 === 0 ? 1 : "50%",
            background: color, opacity: 0,
            animation: `confettiFly ${dur} ${delay} ease-out forwards`,
            ["--rot" as string]: rot,
          }} />
        );
      })}
    </div>
  );
}

// ─── Victory overlay ──────────────────────────────────────────────────────────
function WinOverlay({ show, savedToday, onDismiss, onShare }: { show: boolean; savedToday: number; onDismiss: () => void; onShare: () => void }) {
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [show, onDismiss]);

  if (!show) return null;
  return (
    <div onClick={onDismiss} style={{
      position: "fixed", inset: 0, zIndex: 1400,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.88)", backdropFilter: "blur(20px)",
      animation: "fadeBgIn .3s ease",
    }}>
      <div onClick={e => e.stopPropagation()} style={{ textAlign: "center", animation: "winPop .5s cubic-bezier(.34,1.56,.64,1)", padding: "0 32px" }}>
        <div style={{ fontSize: 72, marginBottom: 16 }}>🏆</div>
        <h2 style={{
          fontFamily: "-apple-system, sans-serif", fontSize: 28, fontWeight: 800,
          background: "linear-gradient(135deg, #34d399, #3b82f6)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          marginBottom: 8,
        }}>All bets secured!</h2>
        <p style={{ fontFamily: "-apple-system, sans-serif", fontSize: 16, color: "rgba(255,255,255,0.5)", marginBottom: 32 }}>
          You saved {fmt(savedToday)} today
        </p>
        <button onClick={onShare} style={{
          width: "100%", padding: "15px 0", borderRadius: 16, border: "none",
          background: "linear-gradient(135deg, #34d399, #10b981)",
          color: "#000", fontSize: 16, fontWeight: 700, cursor: "pointer",
          fontFamily: "-apple-system, sans-serif", marginBottom: 14,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
          </svg>
          Share my win
        </button>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.2)", cursor: "pointer" }} onClick={onDismiss}>
          Tap to continue
        </p>
      </div>
    </div>
  );
}

// ─── Ring ─────────────────────────────────────────────────────────────────────
function Ring({ pct, size = 72, w = 7, color, children }: { pct: number; size?: number; w?: number; color: string; children?: React.ReactNode }) {
  const r = (size - w) / 2, c = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={w} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={w}
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(pct, 1))} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.7s cubic-bezier(.4,0,.2,1)" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {children}
      </div>
    </div>
  );
}

// ─── Fire ─────────────────────────────────────────────────────────────────────
function Fire({ streak }: { streak: number }) {
  const n = streak >= 14 ? 3 : streak >= 7 ? 2 : streak >= 1 ? 1 : 0;
  if (!n) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center" }}>
      {Array.from({ length: n }).map((_, i) => (
        <span key={i} style={{ fontSize: streak >= 14 ? 22 : 18, marginLeft: i ? -4 : 0 }}>🔥</span>
      ))}
    </span>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard({ user }: { user: User }) {
  const supabase = useMemo(() => createClient(), []);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"today" | "stats">("today");
  const [showAdd, setShowAdd] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showWin, setShowWin] = useState(false);
  const [newH, setNewH] = useState({ name: "", emoji: "✨", stake: 500 });
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);
  const [animateDoneIds, setAnimateDoneIds] = useState(new Set<string>());
  const prevAllDone = useRef(false);
  const togglingIds = useRef(new Set<string>());

  // Profile edit state
  const [profileName, setProfileName] = useState(user.user_metadata?.full_name || "");
  const [profileBirth, setProfileBirth] = useState(user.user_metadata?.birth_date || "");
  const [profileColor, setProfileColor] = useState(user.user_metadata?.avatar_color || AVATAR_COLORS[0]);
  const [profileSaving, setProfileSaving] = useState(false);

  // Display state — updated locally after save
  const [displayName, setDisplayName] = useState(user.user_metadata?.full_name || user.email?.split("@")[0] || "?");
  const [avatarColor, setAvatarColor] = useState(user.user_metadata?.avatar_color || AVATAR_COLORS[0]);
  const [avatarUrl, setAvatarUrl] = useState<string>(user.user_metadata?.avatar_url || "");
  const [onboardingDone, setOnboardingDone] = useState(!!user.user_metadata?.birth_date);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Push notifications
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  // Register SW + detect current push status
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    navigator.serviceWorker.register("/sw.js").then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setPushEnabled(!!sub);
    }).catch(() => {});
  }, []);

  const togglePush = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      alert("Push notifications are not supported in this browser.");
      return;
    }
    setPushLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      if (pushEnabled) {
        // Unsubscribe
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
          await sub.unsubscribe();
        }
        setPushEnabled(false);
      } else {
        // Subscribe
        const permission = await Notification.requestPermission();
        if (permission !== "granted") { setPushLoading(false); return; }
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        });
        await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub) });
        setPushEnabled(true);
        haptic([10, 30, 10]);
      }
    } catch (e) {
      console.error("Push error:", e);
    }
    setPushLoading(false);
  };

  // Load habits
  useEffect(() => {
    const load = async () => {
      await supabase.auth.getSession();
      const [{ data: rows }, { data: entries }] = await Promise.all([
        supabase.from("habits").select("*").order("created_at"),
        supabase.from("habit_entries").select("habit_id, completed").eq("date", today()),
      ]);
      const doneMap = new Map((entries ?? []).map(e => [e.habit_id, e.completed]));
      const mapped = (rows ?? []).map(h => ({ ...h, done: doneMap.get(h.id) ?? false }));
      // Init prevAllDone so we don't trigger win overlay on page load if already all done
      prevAllDone.current = mapped.length > 0 && mapped.every(h => h.done);
      setHabits(mapped);
      setLoading(false);
    };
    load();
  }, [supabase]);

  // Show onboarding if birth date not set
  useEffect(() => {
    if (!loading && !onboardingDone) setShowOnboarding(true);
  }, [loading, onboardingDone]);

  const risk = habits.filter(h => !h.done).reduce((s, h) => s + h.stake, 0);
  const done = habits.filter(h => h.done).length;
  const total = habits.length;
  const pct = total ? done / total : 0;
  const saved = habits.reduce((s, h) => s + h.saved, 0);
  const lost = habits.reduce((s, h) => s + h.lost, 0);
  const best = habits.length ? Math.max(...habits.map(h => h.streak), 0) : 0;
  const mult = best >= 30 ? 2.0 : best >= 14 ? 1.5 : best >= 7 ? 1.2 : 1.0;
  const savedToday = habits.filter(h => h.done).reduce((s, h) => s + h.stake, 0);

  const avatarLetter = displayName[0].toUpperCase();
  const memberSince = new Date(user.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // Check for victory moment
  useEffect(() => {
    const allDone = total > 0 && done === total;
    if (allDone && !prevAllDone.current) {
      haptic([20, 50, 20, 50, 80]); // victory pattern
      setShowWin(true);
    }
    prevAllDone.current = allDone;
  }, [done, total]);

  const toggle = async (id: string) => {
    if (togglingIds.current.has(id)) return; // prevent double-tap corruption
    togglingIds.current.add(id);

    const habit = habits.find(h => h.id === id);
    if (!habit) { togglingIds.current.delete(id); return; }
    const wasDone = habit.done;
    const nowDone = !wasDone;

    haptic(nowDone ? [10, 30, 15] : 8);
    setHabits(prev => prev.map(h => h.id !== id ? h : { ...h, done: nowDone }));

    const { error } = await supabase.from("habit_entries").upsert(
      { habit_id: id, user_id: user.id, date: today(), completed: nowDone },
      { onConflict: "habit_id,date" }
    );
    if (error) {
      setHabits(prev => prev.map(h => h.id !== id ? h : { ...h, done: wasDone }));
      togglingIds.current.delete(id);
      return;
    }

    const newStreak = nowDone ? habit.streak + 1 : Math.max(0, habit.streak - 1);
    const newSaved = nowDone ? habit.saved + habit.stake : Math.max(0, habit.saved - habit.stake);
    const { error: updateError } = await supabase.from("habits").update({ streak: newStreak, saved: newSaved }).eq("id", id);
    if (updateError) {
      // Revert all local changes if DB update fails
      setHabits(prev => prev.map(h => h.id !== id ? h : { ...h, done: wasDone, streak: habit.streak, saved: habit.saved }));
    } else {
      setHabits(prev => prev.map(h => h.id !== id ? h : { ...h, streak: newStreak, saved: newSaved }));
      if (nowDone) {
        setAnimateDoneIds(prev => new Set([...prev, id]));
        setTimeout(() => setAnimateDoneIds(prev => { const s = new Set(prev); s.delete(id); return s; }), 500);
      }
    }
    togglingIds.current.delete(id);
  };

  const remove = async (id: string) => {
    haptic(12);
    const snapshot = habits.find(h => h.id === id);
    setHabits(prev => prev.filter(h => h.id !== id));
    const { error } = await supabase.from("habits").delete().eq("id", id);
    if (error && snapshot) {
      // Restore on failure
      setHabits(prev => [...prev, snapshot]);
    }
  };

  const add = async () => {
    if (!newH.name.trim() || adding) return;
    setAdding(true);
    setAddError("");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setAddError("Session expired. Please sign out and sign in again."); setAdding(false); return; }
    const { data, error } = await supabase.from("habits").insert({
      user_id: user.id, name: newH.name.trim(), emoji: newH.emoji, stake: newH.stake,
    }).select().single();
    if (error) { setAddError(error.message); setAdding(false); return; }
    if (data) {
      haptic([10, 20, 10]);
      setHabits(p => [...p, { ...data, done: false }]);
      setNewH({ name: "", emoji: "✨", stake: 500 });
      setShowAdd(false);
    }
    setAdding(false);
  };

  const uploadPhoto = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setAvatarUploading(true);
    setAvatarError("");
    // Always use .jpg path to avoid stale old-extension files
    const path = `${user.id}/avatar.jpg`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, {
      upsert: true,
      contentType: file.type,
    });
    if (error) {
      setAvatarError(error.message);
      setAvatarUploading(false);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
    // Cache-bust so browser loads the new image, not the CDN-cached old one
    const urlWithTs = `${publicUrl}?v=${Date.now()}`;
    await supabase.auth.updateUser({ data: { avatar_url: urlWithTs } });
    setAvatarUrl(urlWithTs);
    setAvatarUploading(false);
  };

  const saveProfile = async () => {
    setProfileSaving(true);
    const { error } = await supabase.auth.updateUser({
      data: { full_name: profileName.trim(), birth_date: profileBirth, avatar_color: profileColor },
    });
    if (!error) {
      if (profileName.trim()) setDisplayName(profileName.trim());
      setAvatarColor(profileColor);
      if (profileBirth) setOnboardingDone(true);
      setShowProfile(false);
      setShowOnboarding(false);
    }
    setProfileSaving(false);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const shareStats = async () => {
    haptic([10, 30, 10]);
    const topStreak = habits.reduce((max, h) => h.streak > max ? h.streak : max, 0);
    const text = `🏆 I just secured all my bets on BetOnMe!\n\n💪 ${done}/${total} habits done\n🔥 ${topStreak}-day streak\n💰 ${fmt(savedToday)} saved today\n\nBet on yourself → betonme.vercel.app`;
    if (navigator.share) {
      try { await navigator.share({ text }); } catch {}
    } else {
      try { await navigator.clipboard.writeText(text); } catch {}
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>💸</div>
          <p style={{ fontFamily: "-apple-system, sans-serif", color: "rgba(255,255,255,0.3)", fontSize: 14 }}>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#000", color: "#f5f5f7",
      fontFamily: "-apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif",
      WebkitFontSmoothing: "antialiased",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { display: none; }
        input { box-sizing: border-box; -webkit-appearance: none; }
        @keyframes slideIn { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
        @keyframes riskPulse { 0%,100% { opacity:1; } 50% { opacity:.55; } }
        @keyframes sheetUp { from { transform:translateY(100%); opacity:0; } to { transform:translateY(0); opacity:1; } }
        @keyframes sheetDown { from { transform:translateY(0); opacity:1; } to { transform:translateY(100%); opacity:0; } }
        @keyframes fadeBgIn { from { opacity:0; } to { opacity:1; } }
        @keyframes fadeBgOut { from { opacity:1; } to { opacity:0; } }
        @keyframes confettiFly {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          80% { opacity: 1; }
          100% { transform: translateY(-100vh) rotate(var(--rot, 540deg)); opacity: 0; }
        }
        @keyframes winPop {
          0% { transform: scale(0.6); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes checkBounce {
          0% { transform: scale(0.65); }
          55% { transform: scale(1.1); }
          100% { transform: scale(1); }
        }
        .avatar-edit:hover .avatar-cam, .avatar-edit:active .avatar-cam { opacity: 1 !important; }
        button { -webkit-tap-highlight-color: transparent; }
        button:active { transform: scale(0.96) !important; opacity: 0.82 !important; transition: transform 0.08s ease, opacity 0.08s ease !important; }
        input { transition: border-color 0.2s ease, box-shadow 0.2s ease; }
        input:focus { border-color: rgba(52,211,153,0.4) !important; box-shadow: 0 0 0 3px rgba(52,211,153,0.08) !important; outline: none !important; }
      `}</style>

      {/* Confetti layer */}
      <Confetti show={showWin} />

      {/* Victory overlay */}
      <WinOverlay show={showWin} savedToday={savedToday} onDismiss={() => setShowWin(false)} onShare={shareStats} />

      <div style={{ maxWidth: 420, margin: "0 auto", padding: "0 20px 140px" }}>

        {/* TOP BAR */}
        <div style={{ padding: "16px 0 6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", fontWeight: 500 }}>
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
          </span>
          <h1 style={{
            fontSize: 18, fontWeight: 800, letterSpacing: -0.3,
            background: "linear-gradient(135deg, #f5f5f7 0%, rgba(255,255,255,0.6) 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>BetOnMe</h1>
        </div>

        {/* USER CARD */}
        <div onClick={() => { haptic(8); setShowProfile(true); }} style={{
          margin: "12px 0 20px", padding: "16px 18px",
          background: "rgba(255,255,255,0.03)", borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.06)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          cursor: "pointer", transition: "background 0.2s ease",
          WebkitTapHighlightColor: "transparent",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 21, flexShrink: 0,
              background: avatarUrl ? "transparent" : avatarColor,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 17, fontWeight: 700, color: "#000", overflow: "hidden",
            }}>
              {avatarUrl
                ? <img src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : avatarLetter}
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: "#f5f5f7", marginBottom: 2 }}>{displayName}</p>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>{user.email}</p>
            </div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeLinecap="round">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </div>

        {/* HERO RISK CARD */}
        <div style={{
          margin: "16px 0 24px",
          background: risk > 0 ? "linear-gradient(145deg, rgba(239,68,68,0.06) 0%, rgba(0,0,0,0) 60%)" : "linear-gradient(145deg, rgba(52,211,153,0.06) 0%, rgba(0,0,0,0) 60%)",
          borderRadius: 28, padding: "28px 24px 24px",
          border: `1px solid ${risk > 0 ? "rgba(239,68,68,0.08)" : "rgba(52,211,153,0.1)"}`,
          transition: "border-color 0.4s ease",
        }}>
          <p style={{
            fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 2.5,
            color: risk > 0 ? "rgba(239,68,68,0.5)" : "rgba(52,211,153,0.6)", marginBottom: 6,
            animation: risk > 0 ? "riskPulse 2.5s ease infinite" : "none",
          }}>
            {risk > 0 ? "At risk today" : total === 0 ? "No bets yet" : "All bets secured"}
          </p>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 48, fontWeight: 700,
            color: risk > 0 ? "#ef4444" : "#34d399", letterSpacing: -1,
          }}>{fmt(risk)}</span>
          {risk > 0 && (
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.2)", marginTop: 6 }}>
              {total - done} habit{total - done > 1 ? "s" : ""} left to secure your money
            </p>
          )}
          {risk === 0 && pct === 1 && total > 0 && (
            <p style={{ fontSize: 14, color: "rgba(52,211,153,0.6)", marginTop: 8, fontWeight: 500 }}>
              You won today. Every dollar saved. 🏆
            </p>
          )}
        </div>

        {/* RINGS */}
        <div style={{ display: "flex", justifyContent: "space-around", padding: "4px 0 28px" }}>
          {[
            { pct, color: "#34d399", label: "Done", val: `${done}/${total}` },
            { pct: saved / (saved + lost || 1), color: "#3b82f6", label: "Win Rate", val: `${Math.round((saved / (saved + lost || 1)) * 100)}%` },
            { pct: best / 30, color: "#f59e0b", label: "Streak", val: `${mult}x` },
          ].map(({ pct: p, color, label, val }) => (
            <div key={label} style={{ textAlign: "center" }}>
              <Ring pct={p} color={color}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 15, fontWeight: 700, color }}>{val}</span>
              </Ring>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 8, fontWeight: 500 }}>{label}</p>
            </div>
          ))}
        </div>

        {/* TABS */}
        <div style={{ display: "flex", marginBottom: 18, background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 3 }}>
          {(["today", "stats"] as const).map(t => (
            <button key={t} onClick={() => { haptic(8); setTab(t); }} style={{
              flex: 1, padding: "9px 0", border: "none", borderRadius: 10,
              background: tab === t ? "rgba(255,255,255,0.07)" : "transparent",
              color: tab === t ? "#f5f5f7" : "rgba(255,255,255,0.3)",
              fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              transition: "background 0.2s ease, color 0.2s ease",
            }}>
              {t === "today" ? "Today" : "Stats"}
            </button>
          ))}
        </div>

        {/* TODAY */}
        {tab === "today" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {habits.length === 0 && (
              <div style={{ textAlign: "center", padding: "48px 0", color: "rgba(255,255,255,0.15)", fontSize: 14 }}>
                No bets yet. Add your first habit below.
              </div>
            )}
            {habits.map((h, i) => (
              <div key={h.id} style={{
                background: h.done ? "linear-gradient(135deg, rgba(52,211,153,0.06) 0%, rgba(0,0,0,0) 100%)" : "rgba(255,255,255,0.02)",
                borderRadius: 20, padding: "18px 18px",
                border: `1px solid ${h.done ? "rgba(52,211,153,0.1)" : "rgba(255,255,255,0.04)"}`,
                animation: `slideIn .45s ease ${i * 0.06}s both`,
                cursor: "pointer", userSelect: "none",
                transition: "background 0.3s ease, border-color 0.3s ease",
              }} onClick={() => toggle(h.id)}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{
                    width: 46, height: 46, borderRadius: 23, flexShrink: 0,
                    background: h.done ? "linear-gradient(135deg, #34d399, #10b981)" : "rgba(255,255,255,0.03)",
                    border: h.done ? "none" : "1.5px solid rgba(255,255,255,0.1)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: h.done ? "0 4px 18px rgba(16,185,129,0.2)" : "none",
                    transition: "background 0.3s ease, box-shadow 0.3s ease",
                    animation: animateDoneIds.has(h.id) ? "checkBounce 0.35s cubic-bezier(.34,1.56,.64,1)" : "none",
                  }}>
                    {h.done ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    ) : <span style={{ fontSize: 20 }}>{h.emoji}</span>}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontSize: 15, fontWeight: 600, marginBottom: 5,
                      color: h.done ? "rgba(255,255,255,0.35)" : "#f5f5f7",
                      textDecoration: h.done ? "line-through" : "none",
                      transition: "color 0.3s ease",
                    }}>{h.name}</p>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {h.streak > 0 && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                          <Fire streak={h.streak} />
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: h.streak >= 7 ? "#f59e0b" : "rgba(255,255,255,0.35)" }}>
                            {h.streak}d
                          </span>
                        </span>
                      )}
                      {h.history.length > 0 && (
                        <div style={{ display: "flex", alignItems: "end", gap: 2 }}>
                          {h.history.slice(-7).map((d, j) => (
                            <div key={j} style={{
                              width: 5, height: d ? 14 : 5, borderRadius: 2.5,
                              background: d ? "linear-gradient(180deg, #34d399, #10b981)" : "rgba(239,68,68,0.25)",
                            }} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 17, fontWeight: 700, color: h.done ? "#34d399" : "#ef4444", transition: "color 0.3s ease" }}>
                        {fmt(h.stake)}
                      </p>
                      <p style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: .5, color: h.done ? "rgba(52,211,153,0.4)" : "rgba(239,68,68,0.4)", marginTop: 2, transition: "color 0.3s ease" }}>
                        {h.done ? "secured" : "at risk"}
                      </p>
                    </div>
                    <button onClick={e => { e.stopPropagation(); remove(h.id); }} style={{
                      background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)",
                      borderRadius: 8, cursor: "pointer", color: "rgba(239,68,68,0.8)",
                      padding: "4px 10px", fontSize: 12, fontWeight: 600, fontFamily: "inherit",
                    }}>Delete</button>
                  </div>
                </div>
              </div>
            ))}

            <button onClick={() => { haptic(8); setShowAdd(true); }} style={{
              background: "transparent", border: "1.5px dashed rgba(255,255,255,0.06)",
              borderRadius: 20, padding: 18, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              color: "rgba(255,255,255,0.18)", fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              New Bet
            </button>
          </div>
        )}

        {/* STATS */}
        {tab === "stats" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, animation: "slideIn .3s ease" }}>
            {habits.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 0", color: "rgba(255,255,255,0.15)", fontSize: 14 }}>
                Add habits to see your stats.
              </div>
            ) : (
              <>
                <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 22, padding: 24, border: "1px solid rgba(255,255,255,0.04)" }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 18 }}>Profit & Loss</p>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 18 }}>
                    <div>
                      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", letterSpacing: 1, marginBottom: 4 }}>SAVED</p>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 26, fontWeight: 700, color: "#34d399" }}>{fmt(saved)}</span>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", letterSpacing: 1, marginBottom: 4 }}>LOST</p>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 26, fontWeight: 700, color: "#ef4444" }}>{fmt(lost)}</span>
                    </div>
                  </div>
                  <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,0.03)", overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 3, width: `${(saved / (saved + lost || 1)) * 100}%`, background: "linear-gradient(90deg, #34d399, #10b981)" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", fontFamily: "'JetBrains Mono', monospace" }}>Net {fmt(saved - lost)}</span>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", fontFamily: "'JetBrains Mono', monospace" }}>{Math.round((saved / (saved + lost || 1)) * 100)}% wins</span>
                  </div>
                </div>

                {habits.map((h, i) => {
                  const rate = h.history.length ? Math.round(h.history.filter(Boolean).length / h.history.length * 100) : 0;
                  return (
                    <div key={h.id} style={{ background: "rgba(255,255,255,0.02)", borderRadius: 22, padding: 20, border: "1px solid rgba(255,255,255,0.04)", animation: `slideIn .4s ease ${i * 0.05}s both` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 18 }}>{h.emoji}</span>
                          <span style={{ fontSize: 14, fontWeight: 600 }}>{h.name}</span>
                        </div>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: "#f59e0b" }}>{h.streak}d</span>
                      </div>
                      {h.history.length > 0 && (
                        <div style={{ display: "flex", gap: 3, alignItems: "end", marginBottom: 14 }}>
                          {h.history.map((d, j) => (
                            <div key={j} style={{ flex: 1, height: d ? 28 : 8, borderRadius: 3, background: d ? "rgba(52,211,153,0.45)" : "rgba(239,68,68,0.12)" }} />
                          ))}
                        </div>
                      )}
                      <div style={{ display: "flex", paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.03)" }}>
                        {[
                          { label: "RATE", val: `${rate}%`, color: rate >= 80 ? "#34d399" : rate >= 50 ? "#f59e0b" : "#ef4444" },
                          { label: "SAVED", val: fmt(h.saved), color: "#34d399" },
                          { label: "LOST", val: fmt(h.lost), color: "#ef4444" },
                          { label: "STAKE", val: `${fmt(h.stake)}/d`, color: "rgba(255,255,255,0.4)" },
                        ].map((s, j) => (
                          <div key={j} style={{ flex: 1 }}>
                            <p style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", letterSpacing: .8, marginBottom: 3 }}>{s.label}</p>
                            <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: s.color }}>{s.val}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        <div style={{ textAlign: "center", padding: "48px 0 24px", borderTop: "1px solid rgba(255,255,255,0.03)", marginTop: 40 }}>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.15)", letterSpacing: 2 }}>
            BUILT BY <span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 700 }}>MONIQTECH</span>
          </p>
        </div>
      </div>

      {/* ADD MODAL */}
      <Sheet show={showAdd} onClose={() => setShowAdd(false)}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 3 }}>Place Your Bet</h2>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", marginBottom: 20 }}>Stake real money on your discipline</p>

        {/* Quick templates */}
        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>Quick start</label>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, msOverflowStyle: "none", scrollbarWidth: "none" } as React.CSSProperties}>
            {TEMPLATES.map(t => (
              <button key={t.name} onClick={() => {
                haptic(8);
                setNewH(p => ({ ...p, name: t.name, emoji: t.emoji }));
              }} style={{
                flexShrink: 0, padding: "8px 14px", borderRadius: 20, border: "none",
                background: newH.name === t.name ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.04)",
                boxShadow: newH.name === t.name ? "inset 0 0 0 1.5px rgba(52,211,153,0.35)" : "none",
                color: newH.name === t.name ? "#34d399" : "rgba(255,255,255,0.5)",
                fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
                whiteSpace: "nowrap",
              }}>
                {t.emoji} {t.name}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>Or type your own</label>
          <input value={newH.name} onChange={e => setNewH(p => ({ ...p, name: e.target.value }))}
            onKeyDown={e => e.key === "Enter" && add()}
            placeholder="e.g. Wake up at 6am" style={inputStyle} />
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>Icon</label>
          <div style={{ display: "flex", gap: 7 }}>
            {["💪", "📖", "🧘", "🏃", "💧", "🚫", "💤", "✨"].map(e => (
              <button key={e} onClick={() => { haptic(6); setNewH(p => ({ ...p, emoji: e })); }} style={{
                width: 42, height: 42, borderRadius: 12, border: "none",
                background: newH.emoji === e ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.03)",
                boxShadow: newH.emoji === e ? "inset 0 0 0 1.5px rgba(52,211,153,0.35)" : "none",
                fontSize: 18, cursor: "pointer",
              }}>{e}</button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 26 }}>
          <label style={labelStyle}>Daily Stake</label>
          <div style={{ display: "flex", gap: 7 }}>
            {[100, 300, 500, 1000, 2500].map(a => (
              <button key={a} onClick={() => { haptic(6); setNewH(p => ({ ...p, stake: a })); }} style={{
                flex: 1, padding: "13px 0", borderRadius: 13, border: "none",
                background: newH.stake === a ? "linear-gradient(135deg, #34d399, #10b981)" : "rgba(255,255,255,0.03)",
                color: newH.stake === a ? "#000" : "rgba(255,255,255,0.35)",
                fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, cursor: "pointer",
              }}>{fmt(a)}</button>
            ))}
          </div>
        </div>

        {addError && <p style={{ fontSize: 13, color: "#ef4444", marginBottom: 12, padding: "10px 14px", background: "rgba(239,68,68,0.08)", borderRadius: 10 }}>{addError}</p>}
        <button onClick={add} disabled={adding || !newH.name.trim()} style={{
          width: "100%", padding: 17, borderRadius: 16, border: "none",
          background: newH.name.trim() ? "linear-gradient(135deg, #34d399, #10b981)" : "rgba(255,255,255,0.03)",
          color: newH.name.trim() ? "#000" : "rgba(255,255,255,0.12)",
          fontSize: 16, fontWeight: 700, cursor: newH.name.trim() && !adding ? "pointer" : "default", fontFamily: "inherit",
          opacity: adding ? 0.7 : 1,
        }}>
          {adding ? "Adding..." : newH.name.trim() ? `Bet ${fmt(newH.stake)}/day on myself` : "Choose or type a habit"}
        </button>
      </Sheet>

      {/* PROFILE MODAL */}
      <Sheet show={showProfile} onClose={() => setShowProfile(false)}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Your Profile</h2>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", marginBottom: 24 }}>Member since {memberSince}</p>

        {/* Hidden file input */}
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
          onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); e.target.value = ""; }} />

        {/* Tappable avatar */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 20, gap: 8 }}>
          <div className="avatar-edit" onClick={() => { haptic(8); fileRef.current?.click(); }} style={{
            width: 80, height: 80, borderRadius: 40, cursor: "pointer", position: "relative",
            background: avatarUrl ? "transparent" : profileColor,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 30, fontWeight: 700, color: "#000", overflow: "hidden",
            boxShadow: "0 0 0 3px rgba(255,255,255,0.08)",
          }}>
            {avatarUrl
              ? <img src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : (profileName || displayName)[0]?.toUpperCase() || "?"}
            {/* Camera overlay */}
            <div className="avatar-cam" style={{
              position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)",
              display: "flex", alignItems: "center", justifyContent: "center",
              opacity: avatarUploading ? 1 : 0, transition: "opacity 0.2s",
            }}>
              {avatarUploading
                ? <span style={{ fontSize: 18 }}>⏳</span>
                : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>}
            </div>
          </div>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
            {avatarUploading ? "Uploading..." : "Tap to change photo"}
          </p>
          {avatarError && (
            <p style={{ fontSize: 12, color: "#ef4444", textAlign: "center", padding: "6px 12px", background: "rgba(239,68,68,0.08)", borderRadius: 8 }}>
              {avatarError}
            </p>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          {[
            { label: "Habits", val: total },
            { label: "Saved", val: fmt(saved) },
            { label: "Best streak", val: `${best}d` },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, background: "rgba(255,255,255,0.03)", borderRadius: 14, padding: "12px 0", textAlign: "center" }}>
              <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 700, color: "#f5f5f7", marginBottom: 3 }}>{s.val}</p>
              <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 0.5 }}>{s.label}</p>
            </div>
          ))}
        </div>

        <button onClick={() => {
          haptic([10, 30, 10]);
          const topStreak = habits.reduce((max, h) => h.streak > max ? h.streak : max, 0);
          const text = `💸 My BetOnMe stats\n\n🏋️ ${total} active habits\n🔥 ${topStreak}-day best streak\n💰 ${fmt(saved)} total saved\n\nBet on yourself → betonme.vercel.app`;
          if (navigator.share) {
            navigator.share({ text }).catch(() => {});
          } else {
            navigator.clipboard.writeText(text).catch(() => {});
          }
        }} style={{
          width: "100%", padding: 14, borderRadius: 16,
          border: "1px solid rgba(52,211,153,0.2)",
          background: "rgba(52,211,153,0.06)",
          color: "rgba(52,211,153,0.9)",
          fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginBottom: 20,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
          </svg>
          Share my stats
        </button>

        <button onClick={togglePush} disabled={pushLoading} style={{
          width: "100%", padding: 14, borderRadius: 16,
          border: `1px solid ${pushEnabled ? "rgba(59,130,246,0.25)" : "rgba(255,255,255,0.08)"}`,
          background: pushEnabled ? "rgba(59,130,246,0.08)" : "rgba(255,255,255,0.03)",
          color: pushEnabled ? "rgba(59,130,246,0.9)" : "rgba(255,255,255,0.4)",
          fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginBottom: 20,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          opacity: pushLoading ? 0.6 : 1,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          {pushLoading ? "..." : pushEnabled ? "Notifications on" : "Enable notifications"}
        </button>

        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Avatar Color</label>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            {AVATAR_COLORS.map(c => (
              <button key={c} onClick={() => { haptic(6); setProfileColor(c); }} style={{
                width: 36, height: 36, borderRadius: 18, border: "none", cursor: "pointer",
                background: c,
                boxShadow: profileColor === c ? "0 0 0 3px #fff" : "none",
              }} />
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Display Name</label>
          <input value={profileName} onChange={e => setProfileName(e.target.value)}
            placeholder="Your name" style={inputStyle} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Date of Birth</label>
          <input type="date" value={profileBirth} onChange={e => setProfileBirth(e.target.value)}
            style={{ ...inputStyle, colorScheme: "dark" }} />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={labelStyle}>Email</label>
          <div style={{ padding: "13px 15px", borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.04)", fontSize: 15, color: "rgba(255,255,255,0.35)" }}>
            {user.email}
          </div>
        </div>

        <button onClick={saveProfile} disabled={profileSaving} style={{
          width: "100%", padding: 16, borderRadius: 16, border: "none",
          background: "linear-gradient(135deg, #34d399, #10b981)",
          color: "#000", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginBottom: 12,
        }}>
          {profileSaving ? "Saving..." : "Save Changes"}
        </button>

        <button onClick={signOut} style={{
          width: "100%", padding: 14, borderRadius: 16, border: "1px solid rgba(239,68,68,0.2)",
          background: "rgba(239,68,68,0.06)", color: "rgba(239,68,68,0.8)",
          fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
        }}>
          Sign Out
        </button>
      </Sheet>

      {/* ONBOARDING */}
      <Sheet show={showOnboarding} onClose={() => {}}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>👋</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Welcome to BetOnMe</h2>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)" }}>Tell us a bit about yourself to get started</p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Your Name</label>
          <input value={profileName} onChange={e => setProfileName(e.target.value)}
            placeholder="Your name" style={inputStyle} />
        </div>

        <div style={{ marginBottom: 28 }}>
          <label style={labelStyle}>Date of Birth</label>
          <input type="date" value={profileBirth} onChange={e => setProfileBirth(e.target.value)}
            style={{ ...inputStyle, colorScheme: "dark" }} />
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", marginTop: 6 }}>Required to participate in bets</p>
        </div>

        <button onClick={saveProfile} disabled={!profileBirth || profileSaving} style={{
          width: "100%", padding: 17, borderRadius: 16, border: "none",
          background: profileBirth ? "linear-gradient(135deg, #34d399, #10b981)" : "rgba(255,255,255,0.05)",
          color: profileBirth ? "#000" : "rgba(255,255,255,0.2)",
          fontSize: 16, fontWeight: 700, cursor: profileBirth ? "pointer" : "default", fontFamily: "inherit",
        }}>
          {profileSaving ? "Saving..." : "Get Started"}
        </button>
      </Sheet>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.35)",
  textTransform: "uppercase", letterSpacing: 1.2, display: "block", marginBottom: 7,
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: 15, borderRadius: 14,
  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)",
  color: "#f5f5f7", fontSize: 16, fontFamily: "inherit", outline: "none",
};
