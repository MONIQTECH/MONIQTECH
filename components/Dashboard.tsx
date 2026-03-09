"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

const fmt = (cents: number) => {
  const abs = Math.abs(cents);
  const dollars = abs / 100;
  return `${cents < 0 ? "-" : ""}$${dollars % 1 === 0 ? dollars.toFixed(0) : dollars.toFixed(2)}`;
};

type Habit = {
  id: string;
  name: string;
  emoji: string;
  stake: number;
  done: boolean;
  streak: number;
  history: number[];
  saved: number;
  lost: number;
  deadline: string;
};

const SAMPLE_HABITS: Habit[] = [
  { id: "1", name: "Morning workout", emoji: "💪", stake: 500, done: false, streak: 12, history: [1,1,1,1,1,1,1,1,1,1,1,1,0,1], saved: 6500, lost: 500, deadline: "10:00 AM" },
  { id: "2", name: "Read 30 minutes", emoji: "📖", stake: 300, done: false, streak: 8, history: [1,1,1,1,1,1,1,1,0,0,1,1,1,0], saved: 4200, lost: 1200, deadline: "9:00 PM" },
];

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

export default function Dashboard({ user }: { user: User }) {
  const supabase = createClient();
  const [habits, setHabits] = useState<Habit[]>(SAMPLE_HABITS);
  const [tab, setTab] = useState<"today" | "stats">("today");
  const [showAdd, setShowAdd] = useState(false);
  const [newH, setNewH] = useState({ name: "", emoji: "✨", stake: 500 });

  const risk = habits.filter(h => !h.done).reduce((s, h) => s + h.stake, 0);
  const done = habits.filter(h => h.done).length;
  const total = habits.length;
  const pct = total ? done / total : 0;
  const saved = habits.reduce((s, h) => s + h.saved, 0);
  const lost = habits.reduce((s, h) => s + h.lost, 0);
  const best = Math.max(...habits.map(h => h.streak), 0);
  const mult = best >= 30 ? 2.0 : best >= 14 ? 1.5 : best >= 7 ? 1.2 : 1.0;

  const toggle = useCallback((id: string) => {
    setHabits(prev => prev.map(h => h.id !== id ? h : {
      ...h, done: !h.done,
      streak: !h.done ? h.streak + 1 : Math.max(0, h.streak - 1),
      saved: !h.done ? h.saved + h.stake : h.saved - h.stake,
    }));
  }, []);

  const remove = useCallback((id: string) => {
    setHabits(prev => prev.filter(h => h.id !== id));
  }, []);

  const add = () => {
    if (!newH.name.trim()) return;
    setHabits(p => [...p, {
      id: Date.now().toString(), name: newH.name, emoji: newH.emoji, stake: newH.stake,
      done: false, streak: 0, history: [], saved: 0, lost: 0, deadline: "11:59 PM",
    }]);
    setNewH({ name: "", emoji: "✨", stake: 500 });
    setShowAdd(false);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

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
        @keyframes slideIn { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
        @keyframes checkPop { 0% { transform:scale(0); } 60% { transform:scale(1.25); } 100% { transform:scale(1); } }
        @keyframes riskPulse { 0%,100% { opacity:1; } 50% { opacity:.55; } }
        @keyframes sheetUp { from { transform:translateY(100%); } to { transform:translateY(0); } }
        @keyframes fadeBg { from { opacity:0; } to { opacity:1; } }
        @keyframes multShine { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
      `}</style>

      <div style={{ maxWidth: 420, margin: "0 auto", padding: "0 20px 140px" }}>

        {/* TOP BAR */}
        <div style={{ padding: "16px 0 6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", fontWeight: 500 }}>
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
          </span>
          <button onClick={signOut} style={{
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 20, padding: "5px 14px", color: "rgba(255,255,255,0.35)",
            fontSize: 12, cursor: "pointer", fontFamily: "inherit",
          }}>
            {user.email?.split("@")[0]}
          </button>
        </div>

        {/* BRAND */}
        <div style={{ padding: "20px 0 6px" }}>
          <h1 style={{
            fontSize: 32, fontWeight: 800, letterSpacing: -0.5,
            background: "linear-gradient(135deg, #f5f5f7 0%, rgba(255,255,255,0.6) 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>BetOnMe</h1>
        </div>

        {/* HERO RISK CARD */}
        <div style={{
          margin: "16px 0 24px",
          background: risk > 0 ? "linear-gradient(145deg, rgba(239,68,68,0.06) 0%, rgba(0,0,0,0) 60%)" : "linear-gradient(145deg, rgba(52,211,153,0.06) 0%, rgba(0,0,0,0) 60%)",
          borderRadius: 28, padding: "28px 24px 24px",
          border: `1px solid ${risk > 0 ? "rgba(239,68,68,0.08)" : "rgba(52,211,153,0.1)"}`,
        }}>
          <p style={{
            fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 2.5,
            color: risk > 0 ? "rgba(239,68,68,0.5)" : "rgba(52,211,153,0.6)", marginBottom: 6,
            animation: risk > 0 ? "riskPulse 2.5s ease infinite" : "none",
          }}>
            {risk > 0 ? "At risk today" : "All bets secured"}
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
          {risk === 0 && pct === 1 && (
            <p style={{ fontSize: 14, color: "rgba(52,211,153,0.6)", marginTop: 8, fontWeight: 500 }}>
              You won today. Every dollar saved. 🏆
            </p>
          )}
        </div>

        {/* RINGS */}
        <div style={{ display: "flex", justifyContent: "space-around", padding: "4px 0 28px" }}>
          {[
            { pct, color: "#34d399", label: "Done", val: `${done}/${total}`, size: 15 },
            { pct: saved / (saved + lost || 1), color: "#3b82f6", label: "Win Rate", val: `${Math.round((saved / (saved + lost || 1)) * 100)}%`, size: 15 },
            { pct: best / 30, color: "#f59e0b", label: "Streak", val: `${mult}x`, size: 15 },
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
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: "9px 0", border: "none", borderRadius: 10,
              background: tab === t ? "rgba(255,255,255,0.07)" : "transparent",
              color: tab === t ? "#f5f5f7" : "rgba(255,255,255,0.3)",
              fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            }}>
              {t === "today" ? "Today" : "Stats"}
            </button>
          ))}
        </div>

        {/* TODAY */}
        {tab === "today" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {habits.map((h, i) => (
              <div key={h.id} style={{
                position: "relative",
                background: h.done ? "linear-gradient(135deg, rgba(52,211,153,0.06) 0%, rgba(0,0,0,0) 100%)" : "rgba(255,255,255,0.02)",
                borderRadius: 20, padding: "18px 18px",
                border: `1px solid ${h.done ? "rgba(52,211,153,0.1)" : "rgba(255,255,255,0.04)"}`,
                animation: `slideIn .45s ease ${i * 0.06}s both`,
                cursor: "pointer", userSelect: "none",
              }} onClick={() => toggle(h.id)}>
                <button onClick={e => { e.stopPropagation(); remove(h.id); }} style={{
                  position: "absolute", top: 10, right: 10, background: "none", border: "none",
                  cursor: "pointer", color: "rgba(255,255,255,0.12)", padding: 4, fontSize: 14,
                }}>✕</button>

                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{
                    width: 46, height: 46, borderRadius: 23, flexShrink: 0,
                    background: h.done ? "linear-gradient(135deg, #34d399, #10b981)" : "rgba(255,255,255,0.03)",
                    border: h.done ? "none" : "1.5px solid rgba(255,255,255,0.1)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: h.done ? "0 4px 18px rgba(16,185,129,0.2)" : "none",
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
                      <div style={{ display: "flex", alignItems: "end", gap: 2 }}>
                        {h.history.slice(-7).map((d, j) => (
                          <div key={j} style={{
                            width: 5, height: d ? 14 : 5, borderRadius: 2.5,
                            background: d ? "linear-gradient(180deg, #34d399, #10b981)" : "rgba(239,68,68,0.25)",
                          }} />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <p style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 17, fontWeight: 700,
                      color: h.done ? "#34d399" : "#ef4444",
                    }}>{fmt(h.stake)}</p>
                    <p style={{
                      fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: .5,
                      color: h.done ? "rgba(52,211,153,0.4)" : "rgba(239,68,68,0.4)", marginTop: 2,
                    }}>{h.done ? "secured" : "at risk"}</p>
                  </div>
                </div>
              </div>
            ))}

            <button onClick={() => setShowAdd(true)} style={{
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
            <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 22, padding: 24, border: "1px solid rgba(255,255,255,0.04)" }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 18 }}>
                Profit & Loss
              </p>
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
                <div style={{
                  height: "100%", borderRadius: 3,
                  width: `${(saved / (saved + lost || 1)) * 100}%`,
                  background: "linear-gradient(90deg, #34d399, #10b981)",
                }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", fontFamily: "'JetBrains Mono', monospace" }}>Net {fmt(saved - lost)}</span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", fontFamily: "'JetBrains Mono', monospace" }}>{Math.round((saved / (saved + lost || 1)) * 100)}% wins</span>
              </div>
            </div>

            {habits.map((h, i) => {
              const rate = h.history.length ? Math.round(h.history.filter(Boolean).length / h.history.length * 100) : 0;
              return (
                <div key={h.id} style={{
                  background: "rgba(255,255,255,0.02)", borderRadius: 22, padding: 20,
                  border: "1px solid rgba(255,255,255,0.04)",
                  animation: `slideIn .4s ease ${i * 0.05}s both`,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 18 }}>{h.emoji}</span>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{h.name}</span>
                    </div>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: "#f59e0b" }}>
                      {h.streak}d
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 3, alignItems: "end", marginBottom: 14 }}>
                    {h.history.map((d, j) => (
                      <div key={j} style={{
                        flex: 1, height: d ? 28 : 8, borderRadius: 3,
                        background: d ? "rgba(52,211,153,0.45)" : "rgba(239,68,68,0.12)",
                      }} />
                    ))}
                  </div>
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
          </div>
        )}

        {/* FOOTER */}
        <div style={{ textAlign: "center", padding: "48px 0 24px", borderTop: "1px solid rgba(255,255,255,0.03)", marginTop: 40 }}>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.15)", letterSpacing: 2 }}>
            BUILT BY <span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 700 }}>MONIQTECH</span>
          </p>
        </div>
      </div>

      {/* ADD MODAL */}
      {showAdd && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          display: "flex", alignItems: "flex-end", justifyContent: "center",
          background: "rgba(0,0,0,0.5)", backdropFilter: "blur(10px)",
        }} onClick={() => setShowAdd(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "#1c1c1e", borderRadius: "22px 22px 0 0",
            padding: "24px 22px 40px", width: "100%", maxWidth: 420,
            animation: "sheetUp .35s cubic-bezier(.32,.72,.24,1)",
          }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.12)", margin: "0 auto 22px" }} />
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 3 }}>Place Your Bet</h2>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", marginBottom: 24 }}>Stake real money on your discipline</p>

            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 1.2, display: "block", marginBottom: 7 }}>Habit</label>
              <input value={newH.name} onChange={e => setNewH(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Wake up at 6am"
                style={{
                  width: "100%", padding: 15, borderRadius: 14,
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)",
                  color: "#f5f5f7", fontSize: 16, fontFamily: "inherit", outline: "none",
                }} />
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 1.2, display: "block", marginBottom: 7 }}>Icon</label>
              <div style={{ display: "flex", gap: 7 }}>
                {["💪", "📖", "🧘", "🏃", "💧", "🚫", "💤", "✨"].map(e => (
                  <button key={e} onClick={() => setNewH(p => ({ ...p, emoji: e }))} style={{
                    width: 42, height: 42, borderRadius: 12, border: "none",
                    background: newH.emoji === e ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.03)",
                    boxShadow: newH.emoji === e ? "inset 0 0 0 1.5px rgba(52,211,153,0.35)" : "none",
                    fontSize: 18, cursor: "pointer",
                  }}>{e}</button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 26 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 1.2, display: "block", marginBottom: 7 }}>Daily Stake</label>
              <div style={{ display: "flex", gap: 7 }}>
                {[100, 300, 500, 1000, 2500].map(a => (
                  <button key={a} onClick={() => setNewH(p => ({ ...p, stake: a }))} style={{
                    flex: 1, padding: "13px 0", borderRadius: 13, border: "none",
                    background: newH.stake === a ? "linear-gradient(135deg, #34d399, #10b981)" : "rgba(255,255,255,0.03)",
                    color: newH.stake === a ? "#000" : "rgba(255,255,255,0.35)",
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, cursor: "pointer",
                  }}>{fmt(a)}</button>
                ))}
              </div>
            </div>

            <button onClick={add} style={{
              width: "100%", padding: 17, borderRadius: 16, border: "none",
              background: newH.name.trim() ? "linear-gradient(135deg, #34d399, #10b981)" : "rgba(255,255,255,0.03)",
              color: newH.name.trim() ? "#000" : "rgba(255,255,255,0.12)",
              fontSize: 16, fontWeight: 700, cursor: newH.name.trim() ? "pointer" : "default", fontFamily: "inherit",
            }}>
              {newH.name.trim() ? `Bet ${fmt(newH.stake)}/day on myself` : "Enter a habit to bet on"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
