import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createPublicClient, http, decodeFunctionData } from "viem";
import { base } from "viem/chains";
import { rateLimit, getIp } from "@/lib/rateLimit";

const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BETONME_WALLET = "0xe7F5BDf1C4b5d970431F10ee65dF5b0474199377";

const USDC_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const publicClient = createPublicClient({ chain: base, transport: http() });

export async function POST(request: Request) {
  // Rate limit: 10 deposit attempts per user IP per 10 minutes
  const ip = getIp(request);
  const rl = rateLimit(`deposit:${ip}`, 10, 10 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many requests. Please wait." }, { status: 429 });
  }

  const { txHash } = await request.json();

  // Must be exactly 0x + 64 hex chars (32 bytes = Ethereum tx hash)
  if (!txHash || typeof txHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return NextResponse.json({ error: "Invalid transaction hash" }, { status: 400 });
  }

  // Get authenticated user
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Client already waited for confirmation — single fast lookup, no timeout risk
  let receipt;
  try {
    receipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });
  } catch {
    return NextResponse.json({ error: "Transaction not found on-chain" }, { status: 400 });
  }

  if (!receipt) return NextResponse.json({ error: "Transaction not found" }, { status: 400 });
  if (receipt.status !== "success") return NextResponse.json({ error: "Transaction failed on-chain" }, { status: 400 });

  // Fetch tx to verify recipient + amount
  let tx;
  try {
    tx = await publicClient.getTransaction({ hash: txHash as `0x${string}` });
  } catch {
    return NextResponse.json({ error: "Could not fetch transaction" }, { status: 400 });
  }

  if (tx.to?.toLowerCase() !== USDC_ADDRESS.toLowerCase()) {
    return NextResponse.json({ error: "Not a USDC transaction" }, { status: 400 });
  }

  // Decode calldata — verify recipient AND amount
  let actualCents: number;
  try {
    const decoded = decodeFunctionData({ abi: USDC_ABI, data: tx.input });
    const recipient = (decoded.args[0] as string).toLowerCase();
    if (recipient !== BETONME_WALLET.toLowerCase()) {
      return NextResponse.json({ error: "USDC not sent to BetOnMe wallet" }, { status: 400 });
    }

    // FIX: trust on-chain amount, not client-provided amountCents
    // USDC has 6 decimals: 1 USDC = 1_000_000, 1 cent = 10_000
    const usdcOnChain = decoded.args[1] as bigint;
    actualCents = Number(usdcOnChain / BigInt(10_000));
    if (actualCents < 100) {
      return NextResponse.json({ error: "Minimum deposit is $1" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Could not decode transaction data" }, { status: 400 });
  }

  // Service role to credit balance
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Idempotency: check if this tx hash was already processed
  const { data: existing } = await admin
    .from("transactions")
    .select("id")
    .eq("description", `USDC deposit ${txHash}`)
    .single();

  if (existing) {
    return NextResponse.json({ error: "Already processed" }, { status: 409 });
  }

  // Credit balance using on-chain amount (not client-provided)
  const { error } = await admin.rpc("credit_balance", {
    p_user_id: user.id,
    p_amount: actualCents,
    p_type: "deposit",
    p_desc: `USDC deposit ${txHash}`,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, credited: actualCents });
}
