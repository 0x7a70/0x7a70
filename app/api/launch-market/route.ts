import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, defineChain, http, parseAbi } from "viem";

const CHAIN_ID = 4663;
const POTATOPAD_TOKENS_URL = `https://potato.fm/api/tokens?chain=${CHAIN_ID}`;
const DEFAULT_RPC_URL = "https://rpc.mainnet.chain.robinhood.com";
const addressPattern = /^0x[a-f0-9]{40}$/;
const poolAbi = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function token0() view returns (address)",
]);

type PotatoPadCreation = {
  token?: string;
  pool?: string;
  lastBuyMs?: number;
};

const robinhoodChain = defineChain({
  id: CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.ROBINHOOD_RPC_URL || DEFAULT_RPC_URL] } },
});

function marketCapEth(sqrtPriceX96: bigint, tokenIsToken0: boolean) {
  if (sqrtPriceX96 <= 0n) return undefined;
  const ratio = Number(sqrtPriceX96) / 2 ** 96;
  const rawPrice = ratio * ratio;
  const price = tokenIsToken0 ? rawPrice : 1 / rawPrice;
  const result = price * 1_000_000_000;
  return Number.isFinite(result) && result > 0 ? result : undefined;
}

export async function GET(request: NextRequest) {
  const requested = [...new Set((request.nextUrl.searchParams.get("tokens") || "")
    .split(",").map((value) => value.trim().toLowerCase()).filter((value) => addressPattern.test(value)))]
    .slice(0, 50);
  if (!requested.length) return NextResponse.json({ markets: {} });

  try {
    const response = await fetch(POTATOPAD_TOKENS_URL, { next: { revalidate: 60 } });
    if (!response.ok) throw new Error(`PotatoPad returned ${response.status}`);
    const payload = await response.json() as { creations?: PotatoPadCreation[] };
    const requestedSet = new Set(requested);
    const creations = (payload.creations || []).filter((creation) =>
      creation.token && creation.pool && requestedSet.has(creation.token.toLowerCase()) && addressPattern.test(creation.pool.toLowerCase()),
    );
    const client = createPublicClient({ chain: robinhoodChain, transport: http(robinhoodChain.rpcUrls.default.http[0], { timeout: 8_000, retryCount: 1 }) });
    const contracts = creations.flatMap((creation) => [
      { address: creation.pool as `0x${string}`, abi: poolAbi, functionName: "slot0" as const },
      { address: creation.pool as `0x${string}`, abi: poolAbi, functionName: "token0" as const },
    ]);
    const results = contracts.length ? await client.multicall({ contracts, allowFailure: true }) : [];
    const markets: Record<string, { marketCapEth?: number; lastBuyAt?: number }> = {};
    creations.forEach((creation, index) => {
      const token = creation.token!.toLowerCase();
      const slot = results[index * 2];
      const token0 = results[index * 2 + 1];
      const sqrtPriceX96 = slot?.status === "success" && Array.isArray(slot.result) ? slot.result[0] as bigint : undefined;
      const poolToken0 = token0?.status === "success" ? String(token0.result).toLowerCase() : undefined;
      markets[token] = {
        marketCapEth: sqrtPriceX96 && poolToken0 ? marketCapEth(sqrtPriceX96, poolToken0 === token) : undefined,
        lastBuyAt: typeof creation.lastBuyMs === "number" ? creation.lastBuyMs : undefined,
      };
    });
    return NextResponse.json({ markets }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
  } catch (error) {
    console.error("launch_market_lookup_failed", { message: error instanceof Error ? error.message : "unknown error" });
    return NextResponse.json({ markets: {} }, { status: 200 });
  }
}
