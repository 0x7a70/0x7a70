import { createHmac, timingSafeEqual } from "node:crypto";
import { CdpClient } from "@coinbase/cdp-sdk";
import {
  createPublicClient, decodeEventLog, defineChain, encodeFunctionData, formatEther,
  formatUnits, http, parseEther, parseUnits, serializeTransaction, type Address, type Hex,
} from "viem";
import {
  DEAD_ADDRESS, POTATOPAD_CURVE_ADDRESS, ROBINHOOD_CHAIN_ID, ROBINHOOD_RPC_URL,
  accountName, resolveTokenAddress, type ExecutionRequest,
} from "./policy";

const chain = defineChain({
  id: ROBINHOOD_CHAIN_ID, name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.ROBINHOOD_RPC_URL || ROBINHOOD_RPC_URL] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } },
});
const publicClient = createPublicClient({ chain, transport: http(chain.rpcUrls.default.http[0], { timeout: 12_000, retryCount: 1 }) });
let cdp: CdpClient | undefined;

const erc20Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

const padAbi = [
  { type: "function", name: "createToken", stateMutability: "payable", inputs: [
    { name: "name", type: "string" }, { name: "symbol", type: "string" },
    { name: "meta", type: "tuple", components: [
      { name: "imageURI", type: "string" }, { name: "website", type: "string" },
      { name: "twitter", type: "string" }, { name: "telegram", type: "string" },
    ] }, { name: "salt", type: "bytes32" },
  ], outputs: [{ name: "token", type: "address" }] },
  { type: "event", name: "TokenCreated", inputs: [
    { indexed: true, name: "token", type: "address" }, { indexed: true, name: "creator", type: "address" },
    { indexed: false, name: "name", type: "string" }, { indexed: false, name: "symbol", type: "string" },
    { indexed: false, name: "pool", type: "address" }, { indexed: false, name: "imageURI", type: "string" },
    { indexed: false, name: "website", type: "string" }, { indexed: false, name: "twitter", type: "string" },
    { indexed: false, name: "telegram", type: "string" },
  ] },
  { type: "event", name: "CurveOpened", inputs: [
    { indexed: true, name: "token", type: "address" }, { indexed: true, name: "pool", type: "address" },
    { indexed: false, name: "positionId", type: "uint256" }, { indexed: false, name: "liquidity", type: "uint128" },
  ] },
  { type: "event", name: "DevBuy", inputs: [
    { indexed: true, name: "token", type: "address" }, { indexed: true, name: "creator", type: "address" },
    { indexed: false, name: "ethIn", type: "uint256" }, { indexed: false, name: "tokensOut", type: "uint256" },
  ] },
] as const;

function cdpClient() {
  if (cdp) return cdp;
  const apiKeyId = process.env.CDP_API_KEY_ID;
  const apiKeySecret = process.env.CDP_API_KEY_SECRET;
  const walletSecret = process.env.CDP_WALLET_SECRET;
  if (!apiKeyId || !apiKeySecret || !walletSecret) throw new Error("CDP signer credentials are not configured");
  cdp = new CdpClient({ apiKeyId, apiKeySecret, walletSecret });
  return cdp;
}

export function authorizeSigner(header: string | null) {
  const expected = process.env.WALLET_SIGNER_TOKEN;
  const supplied = header?.startsWith("Bearer ") ? header.slice(7) : "";
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected); const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function provisionWallet(ownerReference: string) {
  const account = await cdpClient().evm.getOrCreateAccount({ name: accountName(ownerReference) });
  return { walletRef: account.address, address: account.address };
}

async function accountFor(walletRef: string, expected: string, ownerReference: string) {
  if (walletRef.toLowerCase() !== expected.toLowerCase()) throw new Error("wallet reference does not match expected address");
  const account = await cdpClient().evm.getAccount({ address: walletRef as Address });
  if (account.address.toLowerCase() !== expected.toLowerCase()) throw new Error("CDP account mismatch");
  if (account.name !== accountName(ownerReference)) throw new Error("wallet owner mismatch");
  return account;
}

async function ethUsd() {
  const response = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot", { signal: AbortSignal.timeout(8_000), cache: "no-store" });
  if (!response.ok) throw new Error("ETH quote unavailable");
  const json = await response.json() as { data?: { amount?: string } };
  const price = Number(json.data?.amount);
  if (!Number.isFinite(price) || price <= 0) throw new Error("ETH quote unavailable");
  return price;
}

function usdToWei(usd: string, price: number) {
  return parseEther((Number(usd) / price).toFixed(18));
}

export async function walletBalance(address: Address, token: string) {
  if (/^eth$/i.test(token)) return { display: `${formatEther(await publicClient.getBalance({ address }))} ETH` };
  const tokenAddress = resolveTokenAddress(token);
  const [raw, decimals, symbol] = await Promise.all([
    publicClient.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
    publicClient.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "decimals" }),
    publicClient.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "symbol" }),
  ]);
  return { display: `${formatUnits(raw, decimals)} ${symbol}` };
}

function deterministicSalt(idempotencyKey: string) {
  const secret = process.env.WALLET_SIGNER_IDEMPOTENCY_SECRET;
  if (!secret) throw new Error("signer idempotency secret is not configured");
  return `0x${createHmac("sha256", secret).update(`launch:${idempotencyKey}`).digest("hex")}` as Hex;
}

async function buildCall(request: ExecutionRequest, price: number) {
  const op = request.operation;
  if (op.type === "potatopad_creator_fee_claim") throw new Error("creator fee claims are disabled until the verified locker claim path is implemented");
  if (op.type === "eth_transfer") {
    if (op.recipient.toLowerCase() === DEAD_ADDRESS.toLowerCase()) throw new Error("native transfers to the dead address are not supported");
    return { to: op.recipient as Address, data: "0x" as Hex, value: op.unit === "usd" ? usdToWei(op.amount, price) : parseEther(op.amount) };
  }
  if (op.type === "erc20_transfer" || op.type === "erc20_burn_to_dead") {
    const token = resolveTokenAddress(op.token);
    const decimals = await publicClient.readContract({ address: token, abi: erc20Abi, functionName: "decimals" });
    const recipient = op.type === "erc20_transfer" ? op.recipient : op.deadAddress;
    if (op.type === "erc20_burn_to_dead" && recipient.toLowerCase() !== DEAD_ADDRESS.toLowerCase()) throw new Error("invalid burn address");
    return {
      to: token,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [recipient as Address, parseUnits(op.amount, decimals)] }),
      value: 0n,
    };
  }
  if (op.padAddress.toLowerCase() !== POTATOPAD_CURVE_ADDRESS.toLowerCase()) throw new Error("unverified PotatoPad contract");
  if (op.imageUri !== op.meta.imageURI || new URL(op.imageUri).hostname.toLowerCase() !== "pbs.twimg.com") throw new Error("invalid launch image");
  const value = !op.devBuy ? 0n : op.devBuy.unit === "usd" ? usdToWei(op.devBuy.amount, price) : parseEther(op.devBuy.amount);
  return {
    to: POTATOPAD_CURVE_ADDRESS as Address,
    data: encodeFunctionData({ abi: padAbi, functionName: "createToken", args: [op.name, op.symbol, op.meta, deterministicSalt(request.idempotencyKey)] }),
    value,
  };
}

export async function executeTransaction(request: ExecutionRequest) {
  if (process.env.X_CRYPTO_EXECUTION_ENABLED !== "true") throw new Error("crypto execution is disabled");
  const maxUsd = Number(process.env.WALLET_MAX_TRANSACTION_USD);
  if (!Number.isFinite(maxUsd) || maxUsd <= 0) throw new Error("maximum transaction value is not configured");
  const account = await accountFor(request.walletRef, request.expectedFrom, request.ownerReference);
  const price = await ethUsd();
  const call = await buildCall(request, price);
  const valueUsd = Number(formatEther(call.value)) * price;
  if (valueUsd > maxUsd) throw new Error("transaction exceeds the configured value limit");

  await publicClient.call({ account: account.address, ...call });
  const estimatedGas = await publicClient.estimateGas({ account: account.address, ...call });
  const gas = estimatedGas * 125n / 100n;
  const fees = await publicClient.estimateFeesPerGas();
  const { maxFeePerGas, maxPriorityFeePerGas } = fees;
  if (!maxFeePerGas || !maxPriorityFeePerGas) throw new Error("fee estimate unavailable");
  const balance = await publicClient.getBalance({ address: account.address });
  const reserve = usdToWei(request.balancePolicy.minimumEndingBalanceUsd, price);
  if (balance < call.value + gas * maxFeePerGas + reserve) throw new Error("ending balance would violate the reserve policy");
  const nonce = await publicClient.getTransactionCount({ address: account.address, blockTag: "pending" });
  const unsigned = serializeTransaction({ chainId: ROBINHOOD_CHAIN_ID, type: "eip1559", nonce, gas, maxFeePerGas, maxPriorityFeePerGas, ...call });
  const signed = await cdpClient().evm.signTransaction({ address: account.address, transaction: unsigned, idempotencyKey: request.idempotencyKey });
  const transactionHash = await publicClient.sendRawTransaction({ serializedTransaction: signed.signature });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash, confirmations: 1, timeout: 90_000 });
  if (receipt.status !== "success") return { transactionHash, status: "reverted" as const, blockNumber: receipt.blockNumber.toString(), valueWei: call.value.toString() };

  let tokenAddress: string | undefined;
  let poolAddress: string | undefined;
  let positionId: string | undefined;
  let devBuySucceeded: boolean | undefined;
  if (request.operation.type === "potatopad_launch") {
    for (const log of receipt.logs) {
      try {
        const event = decodeEventLog({ abi: padAbi, data: log.data, topics: log.topics });
        if (event.eventName === "TokenCreated") { tokenAddress = String(event.args.token); poolAddress = String(event.args.pool); }
        if (event.eventName === "CurveOpened") { poolAddress = String(event.args.pool); positionId = String(event.args.positionId); }
        if (event.eventName === "DevBuy") devBuySucceeded = true;
      } catch { /* unrelated receipt log */ }
    }
    if (!tokenAddress || !poolAddress || !positionId) throw new Error("launch receipt was missing required verified events");
    if (call.value > 0n && !devBuySucceeded) throw new Error("launch receipt was missing the dev buy event");
  }
  return {
    transactionHash, status: "confirmed" as const, blockNumber: receipt.blockNumber.toString(),
    valueWei: call.value.toString(), tokenAddress, poolAddress, positionId, devBuySucceeded,
  };
}
