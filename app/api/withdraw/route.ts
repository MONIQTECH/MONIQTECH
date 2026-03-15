import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { rateLimit, getIp } from "@/lib/rateLimit";
import { createWalletClient, createPublicClient, http, encodeFunctionData, parseUnits, isAddress, getAddress } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const USDC_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const MIN_WITHDRAW_CENTS = 100;  // $1 minimum
const MAX_WITHDRAW_CENTS = 100_000_00; // $10,000 maximum per tx

const WITHDRAW_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour after last deposit

export async function POST(request: Request) {
  // Rate limit by IP
  const ip = getIp(request);
  const rlIp = rateLimit(`withdraw:ip:${ip}`, 5, 15 * 60 * 1000);
  if (!rlIp.ok) {
    return NextResponse.json({ error: "Too many requests. Please wait." }, { status: 429 });
  }

  // 1. Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Rate limit by user ID (prevents VPN bypass)
  const rlUser = rateLimit(`withdraw:user:${user.id}`, 3, 60 * 60 * 1000); // 3 per hour per user
  if (!rlUser.ok) {
    return NextResponse.json({ error: "Withdrawal limit reached. Max 3 per hour." }, { status: 429 });
  }

  // 2. Parse + validate request
  let amountCents: number;
  let toAddress: string;
  try {
    const body = await request.json();
    amountCents = Math.floor(Number(body.amountCents));
    toAddress = body.toAddress;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!amountCents || amountCents < MIN_WITHDRAW_CENTS) {
    return NextResponse.json({ error: `Minimum withdrawal is $${MIN_WITHDRAW_CENTS / 100}` }, { status: 400 });
  }
  if (amountCents > MAX_WITHDRAW_CENTS) {
    return NextResponse.json({ error: "Maximum withdrawal is $10,000 per transaction" }, { status: 400 });
  }
  if (!toAddress || !isAddress(toAddress)) {
    return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
  }
  const checksumAddress = getAddress(toAddress); // normalize to checksum format

  // 3. Check server has private key configured
  const privateKey = process.env.BETONME_PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    console.error("BETONME_PRIVATE_KEY not configured");
    return NextResponse.json({ error: "Withdrawals temporarily unavailable" }, { status: 503 });
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 3b. Withdraw cooldown: must wait 1 hour after last deposit
  //     Prevents instant-cashout fraud (stolen card → deposit → withdraw)
  const { data: profile } = await admin
    .from("profiles")
    .select("last_deposit_at")
    .eq("id", user.id)
    .single();

  if (profile?.last_deposit_at) {
    const msSinceDeposit = Date.now() - new Date(profile.last_deposit_at).getTime();
    if (msSinceDeposit < WITHDRAW_COOLDOWN_MS) {
      const minutesLeft = Math.ceil((WITHDRAW_COOLDOWN_MS - msSinceDeposit) / 60_000);
      return NextResponse.json(
        { error: `Please wait ${minutesLeft} more minute${minutesLeft !== 1 ? "s" : ""} after your last deposit before withdrawing.` },
        { status: 429 }
      );
    }
  }

  // 4. Atomically deduct balance in DB BEFORE sending on-chain
  //    (prevents double-spend; if on-chain fails we refund)
  const { error: deductErr } = await admin.rpc("withdraw_balance", {
    p_user_id: user.id,
    p_amount: amountCents,
    p_desc: `Withdrawal to ${checksumAddress.slice(0, 8)}...${checksumAddress.slice(-4)}`,
  });

  if (deductErr) {
    const msg = deductErr.message ?? "";
    if (msg.includes("Insufficient balance")) {
      return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to process withdrawal" }, { status: 500 });
  }

  // 5. Send USDC on-chain from BetOnMe wallet
  let txHash: string;
  try {
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const walletClient = createWalletClient({ account, chain: base, transport: http() });
    const publicClient = createPublicClient({ chain: base, transport: http() });

    // USDC has 6 decimals: cents → USDC units (1 cent = 10_000 units)
    const usdcAmount = BigInt(amountCents) * BigInt(10_000);

    const data = encodeFunctionData({
      abi: USDC_ABI,
      functionName: "transfer",
      args: [checksumAddress as `0x${string}`, usdcAmount],
    });

    const hash = await walletClient.sendTransaction({
      to: USDC_ADDRESS,
      data,
    });

    // Wait for confirmation (Base ~2s/block)
    await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
    txHash = hash;
  } catch (e) {
    // On-chain failed — refund the balance we already deducted
    console.error("Withdrawal on-chain failed, refunding:", e);
    await admin.rpc("credit_balance", {
      p_user_id: user.id,
      p_amount: amountCents,
      p_type: "refund",
      p_desc: "Withdrawal refund (on-chain failed)",
    });
    return NextResponse.json({ error: "On-chain transfer failed. Balance restored." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, txHash, withdrawn: amountCents });
}
