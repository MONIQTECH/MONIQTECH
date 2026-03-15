"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import { usePrivy, useLoginWithEmail, useWallets } from "@privy-io/react-auth";
import { parseUnits, encodeFunctionData, createPublicClient, http } from "viem";
import { base } from "viem/chains";

// Read-only Base client — used client-side to wait for tx confirmation
const baseClient = createPublicClient({ chain: base, transport: http() });

// USDC on Base
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const BETONME_WALLET = "0xe7F5BDf1C4b5d970431F10ee65dF5b0474199377" as const;
const USDC_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

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
  insured: boolean; grace_used_at: string | null;
};

type Transaction = {
  id: string; amount: number; type: string;
  description: string; created_at: string; habit_id: string | null;
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

// ─── SwipeToDelete ────────────────────────────────────────────────────────────
function SwipeToDelete({ onDelete, children }: { onDelete: () => void; children: React.ReactNode }) {
  const innerRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const dx = useRef(0);
  const active = useRef(false);

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    dx.current = 0;
    active.current = false;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const deltaX = e.touches[0].clientX - startX.current;
    const deltaY = Math.abs(e.touches[0].clientY - startY.current);
    if (!active.current) {
      if (Math.abs(deltaX) > 8 && Math.abs(deltaX) > deltaY) active.current = true;
      else return;
    }
    const clamped = Math.min(0, deltaX);
    dx.current = clamped;
    const progress = Math.min(1, Math.abs(clamped) / 80);
    if (innerRef.current) {
      innerRef.current.style.transform = `translateX(${clamped}px)`;
      innerRef.current.style.transition = "none";
    }
    if (bgRef.current) bgRef.current.style.opacity = String(progress);
  };

  const onTouchEnd = () => {
    if (!active.current) return;
    active.current = false;
    if (dx.current < -80) {
      if (innerRef.current) {
        innerRef.current.style.transform = "translateX(-105%)";
        innerRef.current.style.opacity = "0";
        innerRef.current.style.transition = "transform 0.22s ease, opacity 0.22s ease";
      }
      setTimeout(onDelete, 230);
    } else {
      if (innerRef.current) {
        innerRef.current.style.transform = "translateX(0)";
        innerRef.current.style.transition = "transform 0.3s cubic-bezier(.32,.72,.24,1)";
      }
      if (bgRef.current) { bgRef.current.style.transition = "opacity 0.3s ease"; bgRef.current.style.opacity = "0"; }
    }
    dx.current = 0;
  };

  return (
    <div style={{ position: "relative", borderRadius: 20, overflow: "hidden" }}>
      <div ref={bgRef} style={{
        position: "absolute", inset: 0, borderRadius: 20, opacity: 0,
        background: "rgba(239,68,68,0.15)",
        display: "flex", alignItems: "center", justifyContent: "flex-end",
        paddingRight: 22,
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
        </svg>
      </div>
      <div ref={innerRef} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        {children}
      </div>
    </div>
  );
}

// ─── Deposit success burst ────────────────────────────────────────────────────
function DepositBurst({ amount, onDone }: { amount: number; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, [onDone]);

  const coins = Array.from({ length: 28 });

  return (
    <div onClick={onDone} style={{
      position: "fixed", inset: 0, zIndex: 2000, display: "flex",
      alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.72)", backdropFilter: "blur(14px)",
      animation: "fadeBgIn 0.2s ease",
    }}>
      {/* Coin particles */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
        {coins.map((_, i) => {
          const left = `${8 + (i / coins.length) * 84 + (Math.sin(i * 1.7) * 6)}%`;
          const delay = `${(i / coins.length) * 0.5}s`;
          const dur = `${0.9 + (i % 5) * 0.15}s`;
          const size = 10 + (i % 4) * 5;
          return (
            <div key={i} style={{
              position: "absolute", bottom: "10%", left,
              width: size, height: size, borderRadius: "50%",
              background: i % 3 === 0 ? "#f59e0b" : i % 3 === 1 ? "#34d399" : "#fbbf24",
              boxShadow: `0 0 ${size}px ${size / 2}px ${i % 3 === 0 ? "rgba(245,158,11,0.4)" : "rgba(52,211,153,0.4)"}`,
              opacity: 0,
              animation: `depositCoin ${dur} ${delay} cubic-bezier(.17,.67,.35,1) forwards`,
              ["--dx" as string]: `${(Math.random() - 0.5) * 60}px`,
            }} />
          );
        })}
      </div>

      {/* Card */}
      <div onClick={e => e.stopPropagation()} style={{
        background: "rgba(20,20,20,0.95)", borderRadius: 28,
        border: "1.5px solid rgba(52,211,153,0.3)",
        padding: "36px 40px", textAlign: "center",
        boxShadow: "0 0 80px rgba(52,211,153,0.15), 0 32px 64px rgba(0,0,0,0.6)",
        animation: "depositCardPop 0.4s cubic-bezier(.34,1.56,.64,1) forwards",
        minWidth: 240,
      }}>
        <div style={{ fontSize: 52, marginBottom: 12, animation: "depositCoinSpin 0.5s ease" }}>💰</div>
        <p style={{ fontSize: 13, fontWeight: 600, color: "rgba(52,211,153,0.7)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>Deposited</p>
        <p style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 42, fontWeight: 700,
          color: "#34d399", letterSpacing: -1,
          animation: "depositNumPop 0.5s 0.15s cubic-bezier(.34,1.4,.64,1) both",
        }}>
          +{fmt(amount)}
        </p>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", marginTop: 10 }}>Balance updated</p>
      </div>
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
  const [newH, setNewH] = useState({ name: "", emoji: "✨", stake: 500, insured: false });
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);
  const [animateDoneIds, setAnimateDoneIds] = useState(new Set<string>());
  const prevAllDone = useRef(false);
  const togglingIds = useRef(new Set<string>());

  // Privy
  const { ready: privyReady, authenticated: privyAuthed, createWallet } = usePrivy();
  const { sendCode, loginWithCode, state: emailLoginState } = useLoginWithEmail();
  const { wallets } = useWallets();
  // Ref keeps latest wallets accessible inside stale closures (handleDeposit useCallback)
  const walletsRef = useRef(wallets);
  useEffect(() => { walletsRef.current = wallets; }, [wallets]);

  // Custom Privy login sheet state
  const [showPrivyLogin, setShowPrivyLogin] = useState(false);
  const [privyEmail, setPrivyEmail] = useState("");
  const [privyCode, setPrivyCode] = useState("");
  const [privyLoginStep, setPrivyLoginStep] = useState<"email" | "code">("email");
  const [privyLoginLoading, setPrivyLoginLoading] = useState(false);
  const [privyLoginError, setPrivyLoginError] = useState("");

  // Wallet
  const [balance, setBalance] = useState(0);
  const [showWallet, setShowWallet] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [depositAmount, setDepositAmount] = useState("10");
  const [depositLoading, setDepositLoading] = useState(false);
  const [depositError, setDepositError] = useState("");
  const [depositSuccess, setDepositSuccess] = useState(0); // cents, 0 = hidden
  const pendingDeposit = useRef(false);

  // Withdraw state
  const [walletTab, setWalletTab] = useState<"deposit" | "withdraw">("deposit");
  const [withdrawAmount, setWithdrawAmount] = useState("10");
  const [withdrawAddress, setWithdrawAddress] = useState("");
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawError, setWithdrawError] = useState("");
  const [withdrawSuccess, setWithdrawSuccess] = useState(0); // cents, 0 = hidden

  // Auto-trigger deposit after Privy login + wallet ready
  // wallets is checked too because the embedded wallet is created async after auth
  useEffect(() => {
    if (privyAuthed && wallets.length > 0 && pendingDeposit.current) {
      pendingDeposit.current = false;
      setShowPrivyLogin(false);
      handleDeposit();
    }
  }, [privyAuthed, wallets]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSendCode = useCallback(async () => {
    if (!privyEmail.includes("@")) { setPrivyLoginError("Enter valid email"); return; }
    setPrivyLoginLoading(true);
    setPrivyLoginError("");
    try {
      await sendCode({ email: privyEmail });
      setPrivyLoginStep("code");
    } catch {
      setPrivyLoginError("Failed to send code. Try again.");
    } finally {
      setPrivyLoginLoading(false);
    }
  }, [privyEmail, sendCode]);

  const handleVerifyCode = useCallback(async () => {
    if (privyCode.length < 4) { setPrivyLoginError("Enter the code from email"); return; }
    setPrivyLoginLoading(true);
    setPrivyLoginError("");
    try {
      await loginWithCode({ code: privyCode });
      // useEffect above will fire when privyAuthed becomes true
    } catch {
      setPrivyLoginError("Wrong code. Try again.");
    } finally {
      setPrivyLoginLoading(false);
    }
  }, [privyCode, loginWithCode]);

  const handleDeposit = useCallback(async () => {
    setDepositError("");
    const dollars = parseFloat(depositAmount);
    if (!dollars || dollars < 1) { setDepositError("Minimum $1"); return; }

    if (!privyAuthed) {
      pendingDeposit.current = true;
      setPrivyLoginStep("email");
      setPrivyLoginError("");
      setPrivyEmail("");
      setPrivyCode("");
      setShowPrivyLogin(true);
      return;
    }

    setDepositLoading(true);
    try {
      // Always read from ref — avoids stale closure capturing old wallets array
      let embeddedWallet = walletsRef.current.find(w => w.walletClientType === "privy");
      if (!embeddedWallet) {
        try {
          await createWallet();
          // Wait for Privy to update wallets state then re-read via ref
          await new Promise(r => setTimeout(r, 1500));
          embeddedWallet = walletsRef.current.find(w => w.walletClientType === "privy");
        } catch {
          // ignore — wallet may already exist
        }
      }
      if (!embeddedWallet) {
        setDepositError("Wallet setup failed. Please try again.");
        setDepositLoading(false);
        return;
      }

      // Get EIP-1193 provider from the wallet
      const provider = await embeddedWallet.getEthereumProvider();

      // Switch to Base (0x2105 = 8453) via provider — avoids switchChain() Privy bug
      try {
        await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x2105" }] });
      } catch { /* already on Base or unsupported — proceed */ }

      const usdcAmount = parseUnits(dollars.toFixed(6), 6);
      const data = encodeFunctionData({ abi: USDC_ABI, functionName: "transfer", args: [BETONME_WALLET, usdcAmount] });

      // 1. Broadcast tx directly via wallet provider
      const hash = await provider.request({
        method: "eth_sendTransaction",
        params: [{ to: USDC_ADDRESS, from: embeddedWallet.address, data }],
      }) as `0x${string}`;

      // Save to localStorage — recovery if browser closes before confirmation
      localStorage.setItem("betonme_pending_tx", JSON.stringify({ txHash: hash, ts: Date.now() }));

      // 2. Wait for on-chain confirmation CLIENT-SIDE (Base ~2s/block)
      //    This avoids Vercel's 10s serverless timeout — client has no timeout limit
      await baseClient.waitForTransactionReceipt({ hash, timeout: 120_000 });

      // 3. Tell server to verify + credit (tx is already confirmed, so server-side is instant)
      const res = await fetch("/api/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash: hash }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to credit balance");

      localStorage.removeItem("betonme_pending_tx");
      setBalance(prev => prev + json.credited);
      setDepositAmount("10");
      setDepositSuccess(json.credited);
      haptic([10, 30, 50, 30, 10]);
    } catch (e: unknown) {
      localStorage.removeItem("betonme_pending_tx");
      const msg = e instanceof Error ? e.message : "Transaction failed";
      let friendly = msg;
      if (msg.toLowerCase().includes("rejected") || msg.toLowerCase().includes("denied") || msg.toLowerCase().includes("cancel")) {
        friendly = "Cancelled";
      } else if (msg.toLowerCase().includes("insufficient") || msg.toLowerCase().includes("transfer amount exceeds balance")) {
        friendly = "Not enough USDC on your wallet. Buy USDC on Base first.";
      } else if (msg.toLowerCase().includes("no embedded") || msg.toLowerCase().includes("no connected") || msg.toLowerCase().includes("wallet not found")) {
        friendly = "Wallet not ready. Please try again in a moment.";
      }
      setDepositError(friendly);
    } finally {
      setDepositLoading(false);
    }
  }, [depositAmount, privyAuthed, createWallet]);

  // Auto-fill withdraw address from Privy embedded wallet
  useEffect(() => {
    const embedded = walletsRef.current.find(w => w.walletClientType === "privy");
    if (embedded && !withdrawAddress) setWithdrawAddress(embedded.address);
  }, [wallets]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleWithdraw = useCallback(async () => {
    setWithdrawError("");
    const dollars = parseFloat(withdrawAmount);
    if (!dollars || dollars < 1) { setWithdrawError("Minimum $1"); return; }
    const amountCents = Math.floor(dollars * 100);
    if (amountCents > balance) { setWithdrawError(`Max ${fmt(balance)}`); return; }
    if (!withdrawAddress || withdrawAddress.length < 10) { setWithdrawError("Enter wallet address"); return; }

    setWithdrawLoading(true);
    try {
      const res = await fetch("/api/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents, toAddress: withdrawAddress }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Withdrawal failed");
      setBalance(prev => prev - json.withdrawn);
      setWithdrawSuccess(json.withdrawn);
      setWithdrawAmount("10");
      haptic([10, 30, 50, 30, 10]);
      setTimeout(() => setWithdrawSuccess(0), 4000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Withdrawal failed";
      setWithdrawError(msg);
    } finally {
      setWithdrawLoading(false);
    }
  }, [withdrawAmount, withdrawAddress, balance]);

  // Profile edit state
  const [profileName, setProfileName] = useState(user.user_metadata?.full_name || "");
  const [profileBirth, setProfileBirth] = useState(user.user_metadata?.birth_date || "");
  const [profileColor, setProfileColor] = useState(user.user_metadata?.avatar_color || AVATAR_COLORS[0]);
  const [profileSaving, setProfileSaving] = useState(false);

  // Display state — updated locally after save
  const [displayName, setDisplayName] = useState(user.user_metadata?.full_name || user.email?.split("@")[0] || "?");
  const [avatarColor, setAvatarColor] = useState(user.user_metadata?.avatar_color || AVATAR_COLORS[0]);
  const [avatarUrl, setAvatarUrl] = useState<string>(user.user_metadata?.avatar_url || "");
  const [onboardingDone, setOnboardingDone] = useState(!!(user.user_metadata?.onboarding_done || user.user_metadata?.birth_date));
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [profileLinkCopied, setProfileLinkCopied] = useState(false);
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
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
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

      // Build last-7-days date range for history
      const last7Dates = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      });
      const sevenDaysAgo = last7Dates[0];

      const [{ data: rows }, { data: entries }, { data: recentEntries }] = await Promise.all([
        supabase.from("habits").select("*").order("created_at"),
        supabase.from("habit_entries").select("habit_id, completed").eq("date", today()),
        supabase.from("habit_entries")
          .select("habit_id, date, completed")
          .gte("date", sevenDaysAgo)
          .order("date"),
      ]);

      // Build per-habit date→completed map for history
      const recentByHabit = new Map<string, Map<string, boolean>>();
      for (const e of recentEntries ?? []) {
        if (!recentByHabit.has(e.habit_id)) recentByHabit.set(e.habit_id, new Map());
        recentByHabit.get(e.habit_id)!.set(e.date, e.completed);
      }

      const doneMap = new Map((entries ?? []).map(e => [e.habit_id, e.completed]));
      const mapped = (rows ?? []).map(h => {
        const habitDates = recentByHabit.get(h.id);
        // Only include dates where an entry exists — shows wins (1) and losses (0)
        const history = last7Dates
          .filter(date => habitDates?.has(date))
          .map(date => habitDates!.get(date) ? 1 : 0);
        return { ...h, done: doneMap.get(h.id) ?? false, history };
      });
      // Init prevAllDone so we don't trigger win overlay on page load if already all done
      prevAllDone.current = mapped.length > 0 && mapped.every(h => h.done);
      setHabits(mapped);

      // Load wallet balance + avatar from profiles table (source of truth after sign-out/in)
      const { data: profile } = await supabase.from("profiles").select("balance, avatar_url").eq("id", user.id).single();
      setBalance(profile?.balance ?? 0);
      if (profile?.avatar_url) setAvatarUrl(profile.avatar_url);

      // Recovery: if user closed browser mid-deposit, try to credit the pending tx
      const pending = localStorage.getItem("betonme_pending_tx");
      if (pending) {
        try {
          const { txHash, ts } = JSON.parse(pending);
          const age = Date.now() - ts;
          if (txHash && age < 3_600_000) { // only retry within 1 hour
            const res = await fetch("/api/deposit", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ txHash }),
            });
            const json = await res.json();
            if (res.ok) setBalance(prev => prev + json.credited);
          }
        } catch { /* ignore */ }
        localStorage.removeItem("betonme_pending_tx");
      }

      setLoading(false);
    };
    load();
  }, [supabase]);

  // Show onboarding if not yet completed
  useEffect(() => {
    if (!loading && !onboardingDone) setShowOnboarding(true);
  }, [loading, onboardingDone]);

  const skipOnboarding = () => {
    setShowOnboarding(false);
    setOnboardingDone(true);
  };

  const loadTransactions = useCallback(async () => {
    setTxLoading(true);
    const { data } = await supabase
      .from("transactions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setTransactions(data ?? []);
    setTxLoading(false);
  }, [supabase, user.id]);

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
  const memberSince = user.created_at ? new Date(user.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "";

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
    // Safety: always release lock after 10s even if something hangs
    const lockTimeout = setTimeout(() => togglingIds.current.delete(id), 10_000);

    const habit = habits.find(h => h.id === id);
    if (!habit) { togglingIds.current.delete(id); return; }
    const wasDone = habit.done;
    const nowDone = !wasDone;

    haptic(nowDone ? [10, 30, 15] : 8);
    setHabits(prev => prev.map(h => h.id !== id ? h : { ...h, done: nowDone }));

    // Atomic: upsert entry + update streak/saved in one DB transaction
    const { data: result, error } = await supabase.rpc("toggle_habit_entry", {
      p_habit_id: id,
      p_date: today(),
      p_completed: nowDone,
    });
    if (error) {
      setHabits(prev => prev.map(h => h.id !== id ? h : { ...h, done: wasDone }));
      clearTimeout(lockTimeout);
      togglingIds.current.delete(id);
      return;
    }

    const newStreak = (result as { streak: number; saved: number }).streak;
    const newSaved  = (result as { streak: number; saved: number }).saved;
    setHabits(prev => prev.map(h => h.id !== id ? h : { ...h, streak: newStreak, saved: newSaved }));
    if (nowDone) {
      setAnimateDoneIds(prev => new Set([...prev, id]));
      setTimeout(() => setAnimateDoneIds(prev => { const s = new Set(prev); s.delete(id); return s; }), 500);
    }
    clearTimeout(lockTimeout);
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

  const insuranceFee = (stake: number) => Math.max(50, Math.round(stake * 0.05)); // min $0.50

  const add = async () => {
    if (!newH.name.trim() || adding) return;
    // Input validation
    if (newH.name.trim().length > 100) { setAddError("Name is too long (max 100 characters)"); return; }
    if (newH.stake < 50 || newH.stake > 1_000_000) { setAddError("Stake must be between $0.50 and $10,000"); return; }
    setAdding(true);
    setAddError("");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setAddError("Session expired. Please sign out and sign in again."); setAdding(false); return; }

    // If insured — check balance covers the fee
    if (newH.insured) {
      const fee = insuranceFee(newH.stake);
      if (balance < fee) { setAddError(`Need ${fmt(fee)} for insurance. Top up your balance first.`); setAdding(false); return; }
    }

    const { data, error } = await supabase.from("habits").insert({
      user_id: user.id, name: newH.name.trim(), emoji: newH.emoji, stake: newH.stake, insured: newH.insured,
    }).select().single();
    if (error) { setAddError(error.message); setAdding(false); return; }

    // Deduct insurance fee from balance
    if (data && newH.insured) {
      const { error: feeErr } = await supabase.rpc("charge_insurance_fee", {
        p_stake: newH.stake,
        p_emoji: newH.emoji,
        p_name: newH.name.trim(),
      });
      if (feeErr) {
        // Fee failed — delete the habit we just created to keep data consistent
        await supabase.from("habits").delete().eq("id", data.id);
        setAddError("Failed to charge insurance fee. Please try again.");
        setAdding(false);
        return;
      }
      setBalance(prev => prev - insuranceFee(newH.stake));
    }

    if (data) {
      haptic([10, 20, 10]);
      setHabits(p => [...p, { ...data, done: false }]);
      setNewH({ name: "", emoji: "✨", stake: 500, insured: false });
      setShowAdd(false);
    }
    setAdding(false);
  };

  const uploadPhoto = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) { setAvatarError("Image must be under 5MB"); return; }
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
    // Validate the URL is a Supabase storage URL — never store arbitrary URLs
    const supabaseBase = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    if (!publicUrl.startsWith(supabaseBase)) {
      setAvatarError("Unexpected storage URL. Please try again.");
      setAvatarUploading(false);
      return;
    }
    // Cache-bust so browser loads the new image, not the CDN-cached old one
    const urlWithTs = `${publicUrl}?v=${Date.now()}`;
    await supabase.auth.updateUser({ data: { avatar_url: urlWithTs } });
    // Also persist to profiles table — auth metadata can lag on next login
    await supabase.from("profiles").upsert(
      { id: user.id, avatar_url: urlWithTs },
      { onConflict: "id" }
    );
    setAvatarUrl(urlWithTs);
    setAvatarUploading(false);
  };

  const saveProfile = async () => {
    setProfileSaving(true);
    const { error } = await supabase.auth.updateUser({
      data: { full_name: profileName.trim(), birth_date: profileBirth, avatar_color: profileColor, onboarding_done: true },
    });
    if (!error) {
      // Sync to profiles table so public page has fresh data
      await supabase.from("profiles").upsert({
        id: user.id,
        display_name: profileName.trim() || displayName,
        avatar_color: profileColor,
        avatar_url: avatarUrl || null,
      }, { onConflict: "id" });
      // profiles upsert is best-effort — auth metadata is source of truth

      if (profileName.trim()) setDisplayName(profileName.trim());
      setAvatarColor(profileColor);
      setOnboardingDone(true);
      setShowProfile(false);
      setShowOnboarding(false);
    }
    setProfileSaving(false);
  };

  const shareProfile = async () => {
    haptic([10, 20, 10]);
    const url = `${window.location.origin}/u/${user.id}`;
    if (navigator.share) {
      await navigator.share({ title: `${displayName} on BetOnMe`, url }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(url).catch(() => {});
      // brief toast feedback handled below via state
    }
    setProfileLinkCopied(true);
    setTimeout(() => setProfileLinkCopied(false), 2000);
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
        @keyframes txSlide { from { opacity:0; transform:translateX(-8px); } to { opacity:1; transform:translateX(0); } }
        @keyframes winPop {
          0% { transform: scale(0.6); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes checkBounce {
          0% { transform: scale(0.65); }
          55% { transform: scale(1.1); }
          100% { transform: scale(1); }
        }
        @keyframes depositCoin {
          0%   { opacity: 0; transform: translateY(0) translateX(0) scale(0.4); }
          15%  { opacity: 1; }
          80%  { opacity: 0.8; }
          100% { opacity: 0; transform: translateY(-55vh) translateX(var(--dx, 0px)) scale(1); }
        }
        @keyframes depositCardPop {
          0%   { opacity: 0; transform: scale(0.7) translateY(30px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes depositNumPop {
          0%   { opacity: 0; transform: scale(0.5); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes depositCoinSpin {
          0%   { transform: scale(0.5) rotate(-20deg); }
          60%  { transform: scale(1.2) rotate(10deg); }
          100% { transform: scale(1) rotate(0deg); }
        }
        .avatar-edit:hover .avatar-cam, .avatar-edit:active .avatar-cam { opacity: 1 !important; }
        button { -webkit-tap-highlight-color: transparent; }
        button:active { transform: scale(0.96) !important; opacity: 0.82 !important; transition: transform 0.08s ease, opacity 0.08s ease !important; }
        input { transition: border-color 0.2s ease, box-shadow 0.2s ease; }
        input:focus { border-color: rgba(52,211,153,0.4) !important; box-shadow: 0 0 0 3px rgba(52,211,153,0.08) !important; outline: none !important; }
      `}</style>

      {/* Deposit success burst */}
      {depositSuccess > 0 && <DepositBurst amount={depositSuccess} onDone={() => setDepositSuccess(0)} />}

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
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Member since {memberSince}</p>
            </div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeLinecap="round">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </div>

        {/* WALLET CARD */}
        <div onClick={() => { haptic(8); setShowWallet(true); loadTransactions(); }} style={{
          marginBottom: 16, padding: "14px 18px",
          background: "rgba(255,255,255,0.03)", borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.06)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          cursor: "pointer", WebkitTapHighlightColor: "transparent",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: "linear-gradient(135deg, rgba(52,211,153,0.15), rgba(59,130,246,0.1))",
              border: "1px solid rgba(52,211,153,0.12)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17,
            }}>💰</div>
            <div>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontWeight: 500, letterSpacing: 0.5, marginBottom: 2 }}>WALLET</p>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 700, color: balance >= 0 ? "#34d399" : "#ef4444" }}>
                {fmt(balance)}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", fontWeight: 500 }}>History</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeLinecap="round">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </div>
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
          <div style={{ display: "flex", flexDirection: "column", gap: 10, animation: "slideIn .3s ease" }}>
            {habits.length === 0 && (
              <div style={{ textAlign: "center", padding: "48px 0", color: "rgba(255,255,255,0.15)", fontSize: 14 }}>
                No bets yet. Add your first habit below.
              </div>
            )}
            {habits.map((h, i) => (
              <SwipeToDelete key={h.id} onDelete={() => remove(h.id)}>
                <div style={{
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
                      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
                        <p style={{
                          fontSize: 15, fontWeight: 600,
                          color: h.done ? "rgba(255,255,255,0.35)" : "#f5f5f7",
                          textDecoration: h.done ? "line-through" : "none",
                          transition: "color 0.3s ease",
                        }}>{h.name}</p>
                        {h.insured && <span style={{ fontSize: 13, lineHeight: 1 }} title="Insured">🛡️</span>}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {h.streak > 0 && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                            <Fire streak={h.streak} />
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: h.streak >= 7 ? "#f59e0b" : "rgba(255,255,255,0.35)" }}>
                              {h.streak}d
                            </span>
                          </span>
                        )}
                        {(h.history?.length ?? 0) > 0 && (
                          <div style={{ display: "flex", alignItems: "end", gap: 2 }}>
                            {(h.history ?? []).slice(-7).map((d, j) => (
                              <div key={j} style={{
                                width: 5, height: d ? 14 : 5, borderRadius: 2.5,
                                background: d ? "linear-gradient(180deg, #34d399, #10b981)" : "rgba(239,68,68,0.25)",
                              }} />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 17, fontWeight: 700, color: h.done ? "#34d399" : "#ef4444", transition: "color 0.3s ease" }}>
                        {fmt(h.stake)}
                      </p>
                      <p style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: .5, color: h.done ? "rgba(52,211,153,0.4)" : "rgba(239,68,68,0.4)", marginTop: 2, transition: "color 0.3s ease" }}>
                        {h.done ? "secured" : "at risk"}
                      </p>
                    </div>
                  </div>
                </div>
              </SwipeToDelete>
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
                  const hist = h.history ?? [];
                  const rate = hist.length ? Math.round(hist.filter(Boolean).length / hist.length * 100) : 0;
                  return (
                    <div key={h.id} style={{ background: "rgba(255,255,255,0.02)", borderRadius: 22, padding: 20, border: "1px solid rgba(255,255,255,0.04)", animation: `slideIn .4s ease ${i * 0.05}s both` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 18 }}>{h.emoji}</span>
                          <span style={{ fontSize: 14, fontWeight: 600 }}>{h.name}</span>
                        </div>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: "#f59e0b" }}>{h.streak}d</span>
                      </div>
                      {hist.length > 0 && (
                        <div style={{ display: "flex", gap: 3, alignItems: "end", marginBottom: 14 }}>
                          {hist.map((d, j) => (
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

        {/* Insurance toggle */}
        <div onClick={() => { haptic(6); setNewH(p => ({ ...p, insured: !p.insured })); }} style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 16px", borderRadius: 16, marginBottom: 16, cursor: "pointer",
          background: newH.insured ? "rgba(245,158,11,0.08)" : "rgba(255,255,255,0.03)",
          border: `1.5px solid ${newH.insured ? "rgba(245,158,11,0.3)" : "rgba(255,255,255,0.06)"}`,
          transition: "all 0.2s",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>🛡️</span>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: newH.insured ? "#f59e0b" : "rgba(255,255,255,0.7)", marginBottom: 2 }}>Habit Insurance</p>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>1 free miss/month · one-time {fmt(insuranceFee(newH.stake))}</p>
            </div>
          </div>
          {/* Toggle pill */}
          <div style={{
            width: 44, height: 26, borderRadius: 13, position: "relative",
            background: newH.insured ? "#f59e0b" : "rgba(255,255,255,0.1)",
            transition: "background 0.2s", flexShrink: 0,
          }}>
            <div style={{
              position: "absolute", top: 3, left: newH.insured ? 21 : 3,
              width: 20, height: 20, borderRadius: "50%", background: "#fff",
              transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
            }} />
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
          <div className="avatar-edit" onClick={() => { if (avatarUploading) return; haptic(8); fileRef.current?.click(); }} style={{
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

        {/* Share Profile */}
        <button onClick={shareProfile} style={{
          width: "100%", padding: 14, borderRadius: 16, marginBottom: 12,
          border: "1.5px solid rgba(255,255,255,0.1)",
          background: profileLinkCopied ? "rgba(52,211,153,0.08)" : "rgba(255,255,255,0.04)",
          color: profileLinkCopied ? "#34d399" : "rgba(255,255,255,0.7)",
          fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          transition: "all 0.2s",
        }}>
          {profileLinkCopied ? "✓ Link Copied!" : "🔗 Share My Profile"}
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
      <Sheet show={showOnboarding} onClose={skipOnboarding}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 48, marginBottom: 14 }}>💸</div>
          <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Welcome to BetOnMe</h2>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>Stake real money on your habits.<br/>Win back every dollar you stick to them.</p>
        </div>

        <div style={{ marginBottom: 28 }}>
          <label style={labelStyle}>What should we call you?</label>
          <input value={profileName} onChange={e => setProfileName(e.target.value)}
            placeholder="Your name (optional)" style={inputStyle}
            onKeyDown={e => e.key === "Enter" && saveProfile()} />
        </div>

        <button onClick={saveProfile} disabled={profileSaving} style={{
          width: "100%", padding: 17, borderRadius: 16, border: "none",
          background: "linear-gradient(135deg, #34d399, #10b981)",
          color: "#000", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
        }}>
          {profileSaving ? "Starting..." : "Start Betting 💸"}
        </button>
        <p onClick={skipOnboarding} style={{
          textAlign: "center", marginTop: 16, fontSize: 13,
          color: "rgba(255,255,255,0.2)", cursor: "pointer",
        }}>Skip for now</p>
      </Sheet>

      {/* WALLET SHEET */}
      <Sheet show={showWallet} onClose={() => setShowWallet(false)}>
        {/* Header */}
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#f5f5f7", marginBottom: 8 }}>Wallet</h2>

        {/* Balance hero */}
        <div style={{
          textAlign: "center", padding: "28px 0 24px",
          background: "linear-gradient(135deg, rgba(52,211,153,0.05), rgba(59,130,246,0.05))",
          borderRadius: 22, border: "1px solid rgba(52,211,153,0.08)", marginBottom: 20,
        }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.3)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>Available Balance</p>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 44, fontWeight: 700, color: balance >= 0 ? "#34d399" : "#ef4444", letterSpacing: -1 }}>
            {fmt(balance)}
          </span>
          {balance < 0 && (
            <p style={{ fontSize: 12, color: "rgba(239,68,68,0.5)", marginTop: 8 }}>Balance is negative — please deposit funds</p>
          )}
        </div>

        {/* Deposit / Withdraw tabs */}
        <div style={{ display: "flex", background: "rgba(255,255,255,0.04)", borderRadius: 14, padding: 3, marginBottom: 20 }}>
          {(["deposit", "withdraw"] as const).map(t => (
            <button key={t} onClick={() => { setWalletTab(t); setDepositError(""); setWithdrawError(""); }} style={{
              flex: 1, padding: "10px 0", border: "none", borderRadius: 11,
              background: walletTab === t ? "rgba(255,255,255,0.07)" : "transparent",
              color: walletTab === t ? "#f5f5f7" : "rgba(255,255,255,0.3)",
              fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              transition: "background 0.2s, color 0.2s",
            }}>{t === "deposit" ? "Deposit" : "Withdraw"}</button>
          ))}
        </div>

        {walletTab === "deposit" && (
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginBottom: 12 }}>Send USDC on Base network to your in-app balance</p>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              {[5, 10, 25, 50].map(amt => (
                <button key={amt} onClick={() => setDepositAmount(String(amt))} style={{
                  flex: 1, padding: "10px 0", borderRadius: 12, border: `1.5px solid ${depositAmount === String(amt) ? "#34d399" : "rgba(255,255,255,0.08)"}`,
                  background: depositAmount === String(amt) ? "rgba(52,211,153,0.1)" : "rgba(255,255,255,0.03)",
                  color: depositAmount === String(amt) ? "#34d399" : "rgba(255,255,255,0.5)",
                  fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
                }}>${amt}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: depositError ? 8 : 0 }}>
              <div style={{ flex: 1, display: "flex", alignItems: "center", background: "rgba(255,255,255,0.04)", borderRadius: 12, border: "1.5px solid rgba(255,255,255,0.08)", paddingLeft: 14 }}>
                <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 16, fontWeight: 600 }}>$</span>
                <input
                  type="number" min="1" step="1"
                  value={depositAmount}
                  onChange={e => setDepositAmount(e.target.value)}
                  style={{ flex: 1, background: "none", border: "none", outline: "none", color: "#f5f5f7", fontSize: 16, fontWeight: 600, padding: "12px 8px", fontFamily: "'JetBrains Mono', monospace" }}
                />
              </div>
              <button onClick={handleDeposit} disabled={depositLoading || !privyReady} style={{
                padding: "12px 20px", borderRadius: 12, border: "none",
                background: depositLoading ? "rgba(52,211,153,0.3)" : "linear-gradient(135deg, #34d399, #10b981)",
                color: "#000", fontSize: 15, fontWeight: 700, cursor: depositLoading ? "default" : "pointer",
                fontFamily: "inherit", minWidth: 100, transition: "all 0.2s",
              }}>
                {depositLoading ? (walletsRef.current.length === 0 ? "Setting up…" : "Sending…") : privyAuthed ? "Deposit" : "Connect Wallet"}
              </button>
            </div>
            {depositError && <p style={{ fontSize: 12, color: "#ef4444", marginTop: 4 }}>{depositError}</p>}
          </div>
        )}

        {walletTab === "withdraw" && (
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginBottom: 12 }}>Withdraw USDC to any Base wallet. Min $1.</p>
            {withdrawSuccess > 0 ? (
              <div style={{
                textAlign: "center", padding: "24px 0",
                background: "rgba(52,211,153,0.06)", borderRadius: 16,
                border: "1px solid rgba(52,211,153,0.15)",
              }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
                <p style={{ fontSize: 16, fontWeight: 700, color: "#34d399" }}>{fmt(withdrawSuccess)} sent!</p>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>USDC is on its way to your wallet</p>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  {[5, 10, 25, 50].map(amt => (
                    <button key={amt} onClick={() => setWithdrawAmount(String(amt))} style={{
                      flex: 1, padding: "10px 0", borderRadius: 12,
                      border: `1.5px solid ${withdrawAmount === String(amt) ? "#3b82f6" : "rgba(255,255,255,0.08)"}`,
                      background: withdrawAmount === String(amt) ? "rgba(59,130,246,0.1)" : "rgba(255,255,255,0.03)",
                      color: withdrawAmount === String(amt) ? "#3b82f6" : "rgba(255,255,255,0.5)",
                      fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
                    }}>${amt}</button>
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", background: "rgba(255,255,255,0.04)", borderRadius: 12, border: "1.5px solid rgba(255,255,255,0.08)", paddingLeft: 14, marginBottom: 8 }}>
                  <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 16, fontWeight: 600 }}>$</span>
                  <input
                    type="number" min="1" step="1"
                    value={withdrawAmount}
                    onChange={e => setWithdrawAmount(e.target.value)}
                    style={{ flex: 1, background: "none", border: "none", outline: "none", color: "#f5f5f7", fontSize: 16, fontWeight: 600, padding: "12px 8px", fontFamily: "'JetBrains Mono', monospace" }}
                  />
                </div>
                <input
                  type="text" placeholder="0x... wallet address"
                  value={withdrawAddress}
                  onChange={e => setWithdrawAddress(e.target.value)}
                  style={{ ...inputStyle, marginBottom: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}
                />
                <button onClick={handleWithdraw} disabled={withdrawLoading || balance < 100} style={{
                  width: "100%", padding: "14px 0", borderRadius: 14, border: "none",
                  background: withdrawLoading ? "rgba(59,130,246,0.3)" : balance < 100 ? "rgba(255,255,255,0.05)" : "linear-gradient(135deg, #3b82f6, #6366f1)",
                  color: balance < 100 ? "rgba(255,255,255,0.2)" : "#fff",
                  fontSize: 15, fontWeight: 700, cursor: withdrawLoading || balance < 100 ? "default" : "pointer",
                  fontFamily: "inherit", transition: "all 0.2s",
                }}>
                  {withdrawLoading ? "Sending…" : balance < 100 ? "No balance to withdraw" : `Withdraw ${fmt(Math.floor(parseFloat(withdrawAmount || "0") * 100))}`}
                </button>
                {withdrawError && <p style={{ fontSize: 12, color: "#ef4444", marginTop: 8 }}>{withdrawError}</p>}
              </>
            )}
          </div>
        )}

        {/* Transaction history */}
        <p style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.3)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>History</p>

        {txLoading ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: "rgba(255,255,255,0.2)", fontSize: 14 }}>Loading...</div>
        ) : transactions.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: "rgba(255,255,255,0.15)", fontSize: 14 }}>
            No transactions yet.<br/>Your deposits and penalties will appear here.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {transactions.map((tx, i) => {
              const isCredit = tx.amount > 0;
              const icon = tx.type === "deposit" ? "💳" : tx.type === "penalty" ? "💸" : tx.type === "withdrawal" ? "⬆️" : tx.type === "refund" ? "↩️" : "💰";
              const color = isCredit ? "#34d399" : "#ef4444";
              const date = new Date(tx.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
              return (
                <div key={tx.id} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "14px 16px",
                  background: "rgba(255,255,255,0.02)", borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.04)",
                  animation: `txSlide 0.3s ease ${i * 0.04}s both`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                      background: isCredit ? "rgba(52,211,153,0.08)" : "rgba(239,68,68,0.08)",
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17,
                    }}>{icon}</div>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "#f5f5f7", marginBottom: 2 }}>{tx.description || tx.type}</p>
                      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>{date}</p>
                    </div>
                  </div>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 15, fontWeight: 700, color }}>
                    {isCredit ? "+" : ""}{fmt(tx.amount)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Sheet>

      {/* PRIVY LOGIN SHEET — custom bottom sheet instead of Privy modal */}
      <Sheet show={showPrivyLogin} onClose={() => { setShowPrivyLogin(false); pendingDeposit.current = false; }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🔐</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#f5f5f7", marginBottom: 6 }}>Connect Wallet</h2>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)" }}>
            {privyLoginStep === "email" ? "Enter your email to create or connect a crypto wallet" : `Enter the 6-digit code sent to ${privyEmail}`}
          </p>
        </div>

        {privyLoginStep === "email" ? (
          <>
            <input
              type="email" placeholder="you@example.com"
              value={privyEmail}
              onChange={e => setPrivyEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSendCode()}
              autoFocus
              style={{ ...inputStyle, marginBottom: 12 }}
            />
            <button onClick={handleSendCode} disabled={privyLoginLoading} style={{
              width: "100%", padding: 16, borderRadius: 16, border: "none",
              background: privyLoginLoading ? "rgba(52,211,153,0.3)" : "linear-gradient(135deg, #34d399, #10b981)",
              color: "#000", fontSize: 16, fontWeight: 700, cursor: privyLoginLoading ? "default" : "pointer", fontFamily: "inherit",
            }}>
              {privyLoginLoading ? "Sending…" : "Send Code"}
            </button>
          </>
        ) : (
          <>
            <input
              type="text" inputMode="numeric" placeholder="123456"
              value={privyCode}
              onChange={e => setPrivyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={e => e.key === "Enter" && handleVerifyCode()}
              autoFocus
              style={{ ...inputStyle, marginBottom: 12, textAlign: "center", fontSize: 24, letterSpacing: 8, fontFamily: "'JetBrains Mono', monospace" }}
            />
            <button onClick={handleVerifyCode} disabled={privyLoginLoading} style={{
              width: "100%", padding: 16, borderRadius: 16, border: "none",
              background: privyLoginLoading ? "rgba(52,211,153,0.3)" : "linear-gradient(135deg, #34d399, #10b981)",
              color: "#000", fontSize: 16, fontWeight: 700, cursor: privyLoginLoading ? "default" : "pointer", fontFamily: "inherit", marginBottom: 12,
            }}>
              {privyLoginLoading ? "Verifying…" : "Verify & Continue"}
            </button>
            <button onClick={() => { setPrivyLoginStep("email"); setPrivyCode(""); setPrivyLoginError(""); }} style={{
              width: "100%", padding: 12, borderRadius: 14, border: "none",
              background: "transparent", color: "rgba(255,255,255,0.35)", fontSize: 14, cursor: "pointer", fontFamily: "inherit",
            }}>
              ← Change email
            </button>
          </>
        )}

        {privyLoginError && <p style={{ fontSize: 13, color: "#ef4444", marginTop: 8, textAlign: "center" }}>{privyLoginError}</p>}
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
