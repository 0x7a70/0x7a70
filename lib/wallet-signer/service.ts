import { createHmac, timingSafeEqual } from "node:crypto";
import { CdpClient } from "@coinbase/cdp-sdk";
import {
  createPublicClient, decodeEventLog, defineChain, encodeAbiParameters, encodeFunctionData, formatEther,
  formatUnits, getCreate2Address, http, keccak256, parseEther, parseUnits, serializeTransaction, toHex, type Address, type Hex,
} from "viem";
import {
  DEAD_ADDRESS, POTATOPAD_CURVE_ADDRESS, POTATOPAD_LOCKER_ADDRESS, ROBINHOOD_CHAIN_ID, ROBINHOOD_RPC_URL,
  MAX_LAUNCH_DEV_BUY_WEI, POTATOPAD_POOL_FEE, ROBINHOOD_WETH_ADDRESS, UNISWAP_V3_QUOTER_ADDRESS, UNISWAP_V3_ROUTER_ADDRESS,
  accountName, resolveTokenAddress, type BroadcastRequest, type ExecutionRequest, type TransactionStatusRequest,
} from "./policy";

const chain = defineChain({
  id: ROBINHOOD_CHAIN_ID, name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.ROBINHOOD_RPC_URL || ROBINHOOD_RPC_URL] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } },
});
const publicClient = createPublicClient({ chain, transport: http(chain.rpcUrls.default.http[0], { timeout: 12_000, retryCount: 1 }) });
let cdp: CdpClient | undefined;
const ROBINHOOD_BLOCKSCOUT_API = "https://robinhoodchain.blockscout.com/api/v2";

const erc20Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

const swapRouterAbi = [
  { type: "function", name: "exactInputSingle", stateMutability: "payable", inputs: [{ name: "params", type: "tuple", components: [
    { name: "tokenIn", type: "address" }, { name: "tokenOut", type: "address" }, { name: "fee", type: "uint24" },
    { name: "recipient", type: "address" }, { name: "amountIn", type: "uint256" }, { name: "amountOutMinimum", type: "uint256" },
    { name: "sqrtPriceLimitX96", type: "uint160" },
  ] }], outputs: [{ name: "amountOut", type: "uint256" }] },
  { type: "function", name: "multicall", stateMutability: "payable", inputs: [{ name: "deadline", type: "uint256" }, { name: "data", type: "bytes[]" }], outputs: [{ type: "bytes[]" }] },
  { type: "function", name: "unwrapWETH9", stateMutability: "payable", inputs: [{ name: "amountMinimum", type: "uint256" }, { name: "recipient", type: "address" }], outputs: [] },
] as const;

const quoterAbi = [{
  type: "function", name: "quoteExactInputSingle", stateMutability: "nonpayable",
  inputs: [{ name: "params", type: "tuple", components: [
    { name: "tokenIn", type: "address" }, { name: "tokenOut", type: "address" }, { name: "amountIn", type: "uint256" },
    { name: "fee", type: "uint24" }, { name: "sqrtPriceLimitX96", type: "uint160" },
  ] }],
  outputs: [{ name: "amountOut", type: "uint256" }, { name: "sqrtPriceX96After", type: "uint160" }, { name: "initializedTicksCrossed", type: "uint32" }, { name: "gasEstimate", type: "uint256" }],
}, {
  type: "function", name: "quoteExactOutputSingle", stateMutability: "nonpayable",
  inputs: [{ name: "params", type: "tuple", components: [
    { name: "tokenIn", type: "address" }, { name: "tokenOut", type: "address" }, { name: "amount", type: "uint256" },
    { name: "fee", type: "uint24" }, { name: "sqrtPriceLimitX96", type: "uint160" },
  ] }],
  outputs: [{ name: "amountIn", type: "uint256" }, { name: "sqrtPriceX96After", type: "uint160" }, { name: "initializedTicksCrossed", type: "uint32" }, { name: "gasEstimate", type: "uint256" }],
}] as const;

const ROUTER_ADDRESS_THIS = "0x0000000000000000000000000000000000000002" as Address;

const padAbi = [
  { type: "function", name: "locker", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "weth", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "tokenFactory", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "v3Factory", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "curves", stateMutability: "view", inputs: [{ name: "token", type: "address" }], outputs: [
    { name: "creator", type: "address" }, { name: "pool", type: "address" },
    { name: "positionId", type: "uint256" }, { name: "bonded", type: "bool" },
  ] },
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

const tokenFactoryAbi = [
  { type: "function", name: "initCodeHash", stateMutability: "view", inputs: [
    { name: "name", type: "string" }, { name: "symbol", type: "string" }, { name: "isReward", type: "bool" },
  ], outputs: [{ type: "bytes32" }] },
] as const;

const v3FactoryAbi = [
  { type: "function", name: "getPool", stateMutability: "view", inputs: [
    { name: "tokenA", type: "address" }, { name: "tokenB", type: "address" }, { name: "fee", type: "uint24" },
  ], outputs: [{ type: "address" }] },
] as const;

const lockerAbi = [
  { type: "function", name: "pad", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "weth", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "positions", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [
    { name: "creator", type: "address" }, { name: "token0", type: "address" }, { name: "token1", type: "address" },
  ] },
  { type: "function", name: "beneficiaryOf", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "address" }] },
  { type: "function", name: "collectAndClaim", stateMutability: "nonpayable", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [
    { name: "collected0", type: "uint256" }, { name: "collected1", type: "uint256" },
    { name: "paid0", type: "uint256" }, { name: "paid1", type: "uint256" },
  ] },
  { type: "event", name: "FeesCollected", inputs: [
    { indexed: true, name: "tokenId", type: "uint256" }, { indexed: true, name: "caller", type: "address" },
    { indexed: false, name: "amount0", type: "uint256" }, { indexed: false, name: "amount1", type: "uint256" },
  ] },
  { type: "event", name: "FeesClaimed", inputs: [
    { indexed: true, name: "asset", type: "address" }, { indexed: true, name: "beneficiary", type: "address" },
    { indexed: false, name: "amount", type: "uint256" },
  ] },
] as const;

function cdpClient() {
  if (cdp) return cdp;
  if (process.env.VERCEL === "1" && process.env.VERCEL_ENV !== "production") {
    throw new Error("CDP signing is disabled outside the production deployment");
  }
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

async function tokenAmount(owner: Address, token: Address, amount: string, unit: "token" | "percent", decimals: number) {
  if (unit === "token") return parseUnits(amount, decimals);
  const scaledPercent = parseUnits(amount, 4);
  if (scaledPercent <= 0n || scaledPercent > 1_000_000n) throw new Error("percentage must be greater than zero and no more than 100");
  const balance = await publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner] });
  return balance * scaledPercent / 1_000_000n;
}

export async function walletBalance(address: Address, token: string) {
  if (/^eth$/i.test(token)) return { display: `${formatEther(await publicClient.getBalance({ address }))} ETH` };
  const tokenAddress = await resolveHeldTokenAddress(address, token);
  const [raw, decimals, symbol] = await Promise.all([
    publicClient.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
    publicClient.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "decimals" }),
    publicClient.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "symbol" }),
  ]);
  return { display: `${formatUnits(raw, decimals)} ${symbol}` };
}

type BlockscoutTokenBalance = {
  value?: string;
  token?: { symbol?: string; type?: string; address_hash?: string };
};

async function resolveHeldTokenAddress(owner: Address, identifier: string) {
  if (/^0x[a-fA-F0-9]{40}$/.test(identifier) || /^\$?0x7a70$/i.test(identifier)) {
    return resolveTokenAddress(identifier);
  }
  const ticker = identifier.replace(/^\$/, "").trim().toUpperCase();
  if (!/^[A-Z0-9]{1,32}$/.test(ticker)) throw new Error("token must be a held ticker or exact contract address");
  const response = await fetch(`${ROBINHOOD_BLOCKSCOUT_API}/addresses/${owner}/token-balances`, {
    signal: AbortSignal.timeout(8_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("held token lookup is unavailable");
  const balances = await response.json() as BlockscoutTokenBalance[];
  if (!Array.isArray(balances)) throw new Error("held token lookup returned invalid data");
  const candidateAddresses = [...new Set(balances
    .filter((entry) => entry.token?.type === "ERC-20"
      && entry.token.symbol?.toUpperCase() === ticker
      && /^0x[a-fA-F0-9]{40}$/.test(entry.token.address_hash || "")
      && /^\d+$/.test(entry.value || "")
      && BigInt(entry.value || "0") > 0n)
    .map((entry) => entry.token!.address_hash!.toLowerCase()))];
  if (!candidateAddresses.length) throw new Error(`no held token with ticker ${ticker} was found; try again with the contract address`);
  if (candidateAddresses.length > 20) throw new Error(`multiple held tokens use ticker ${ticker}; try again with the contract address`);
  const verified = (await Promise.all(candidateAddresses.map(async (candidate) => {
    const address = candidate as Address;
    try {
      const [symbol, balance] = await Promise.all([
        publicClient.readContract({ address, abi: erc20Abi, functionName: "symbol" }),
        publicClient.readContract({ address, abi: erc20Abi, functionName: "balanceOf", args: [owner] }),
      ]);
      return symbol.toUpperCase() === ticker && balance > 0n ? address : null;
    } catch {
      return null;
    }
  }))).filter((address): address is Address => Boolean(address));
  if (verified.length !== 1) {
    throw new Error(verified.length
      ? `multiple held tokens use ticker ${ticker}; try again with the contract address`
      : `no held token with ticker ${ticker} was found; try again with the contract address`);
  }
  return verified[0];
}

function deterministicSaltSeed(idempotencyKey: string) {
  const secret = process.env.WALLET_SIGNER_IDEMPOTENCY_SECRET;
  if (!secret) throw new Error("signer idempotency secret is not configured");
  return `0x${createHmac("sha256", secret).update(`launch:${idempotencyKey}`).digest("hex")}` as Hex;
}

async function findVanitySalt(idempotencyKey: string, creator: Address, name: string, symbol: string) {
  const [factory, v3Factory, weth] = await Promise.all([
    publicClient.readContract({ address: POTATOPAD_CURVE_ADDRESS as Address, abi: padAbi, functionName: "tokenFactory" }),
    publicClient.readContract({ address: POTATOPAD_CURVE_ADDRESS as Address, abi: padAbi, functionName: "v3Factory" }),
    publicClient.readContract({ address: POTATOPAD_CURVE_ADDRESS as Address, abi: padAbi, functionName: "weth" }),
  ]);
  const initCodeHash = await publicClient.readContract({
    address: factory, abi: tokenFactoryAbi, functionName: "initCodeHash", args: [name, symbol, false],
  });
  const start = BigInt(deterministicSaltSeed(idempotencyKey));
  const mask = (1n << 256n) - 1n;
  const maximumTries = 1_500_000;
  for (let nonce = 0; nonce < maximumTries; nonce += 1) {
    const salt = toHex((start + BigInt(nonce)) & mask, { size: 32 });
    const derivedSalt = keccak256(encodeAbiParameters(
      [{ type: "address" }, { type: "bytes32" }],
      [creator, salt],
    ));
    const predicted = getCreate2Address({ from: factory, salt: derivedSalt, bytecodeHash: initCodeHash });
    if (predicted.slice(2, 6).toLowerCase() !== "7a70") continue;
    const [code, pool] = await Promise.all([
      publicClient.getCode({ address: predicted }),
      publicClient.readContract({ address: v3Factory, abi: v3FactoryAbi, functionName: "getPool", args: [predicted, weth, 10_000] }),
    ]);
    if ((!code || code === "0x") && /^0x0{40}$/i.test(pool)) return { salt, predicted };
  }
  throw new Error("unable to derive an unused 0x7a70 launch address");
}

async function buildCall(request: ExecutionRequest, price: number) {
  const op = request.operation;
  if (op.type === "potatopad_creator_fee_claim") {
    const token = await resolveHeldTokenAddress(request.expectedFrom as Address, op.token);
    const padAddress = op.padAddress as Address;
    const lockerAddress = op.lockerAddress as Address;
    const [configuredLocker, weth, curve, lockerPad] = await Promise.all([
      publicClient.readContract({ address: padAddress, abi: padAbi, functionName: "locker" }),
      publicClient.readContract({ address: padAddress, abi: padAbi, functionName: "weth" }),
      publicClient.readContract({ address: padAddress, abi: padAbi, functionName: "curves", args: [token] }),
      publicClient.readContract({ address: lockerAddress, abi: lockerAbi, functionName: "pad" }),
    ]);
    if (configuredLocker.toLowerCase() !== POTATOPAD_LOCKER_ADDRESS.toLowerCase() || lockerPad.toLowerCase() !== POTATOPAD_CURVE_ADDRESS.toLowerCase()) {
      throw new Error("PotatoPad locker relationship is unverified");
    }
    const [creator, , positionId] = curve;
    if (creator.toLowerCase() !== request.expectedFrom.toLowerCase() || positionId === 0n) throw new Error("wallet is not the verified launch creator");
    const [position, beneficiary] = await Promise.all([
      publicClient.readContract({ address: lockerAddress, abi: lockerAbi, functionName: "positions", args: [positionId] }),
      publicClient.readContract({ address: lockerAddress, abi: lockerAbi, functionName: "beneficiaryOf", args: [positionId] }),
    ]);
    const [positionCreator, token0, token1] = position;
    if (positionCreator.toLowerCase() !== request.expectedFrom.toLowerCase() || beneficiary.toLowerCase() !== request.expectedFrom.toLowerCase()) {
      throw new Error("wallet is not the current creator fee beneficiary");
    }
    const assets = new Set([token0.toLowerCase(), token1.toLowerCase()]);
    if (!assets.has(token.toLowerCase()) || !assets.has(weth.toLowerCase())) throw new Error("locker position assets do not match the launch");
    return {
      to: lockerAddress,
      data: encodeFunctionData({ abi: lockerAbi, functionName: "collectAndClaim", args: [positionId] }),
      value: 0n,
    };
  }
  if (op.type === "eth_transfer") {
    if (op.recipient.toLowerCase() === DEAD_ADDRESS.toLowerCase()) throw new Error("native transfers to the dead address are not supported");
    return {
      to: op.recipient as Address,
      data: "0x" as Hex,
      value: op.unit === "percent" ? 0n : op.unit === "usd" ? usdToWei(op.amount, price) : parseEther(op.amount),
    };
  }
  if (op.type === "erc20_transfer" || op.type === "erc20_burn_to_dead") {
    const owner = request.expectedFrom as Address;
    const token = await resolveHeldTokenAddress(owner, op.token);
    const decimals = await publicClient.readContract({ address: token, abi: erc20Abi, functionName: "decimals" });
    const recipient = op.type === "erc20_transfer" ? op.recipient : op.deadAddress;
    if (op.type === "erc20_burn_to_dead" && recipient.toLowerCase() !== DEAD_ADDRESS.toLowerCase()) throw new Error("invalid burn address");
    let rawAmount = op.unit === "usd" ? 0n : await tokenAmount(owner, token, op.amount, op.unit, decimals);
    if (op.unit === "usd") {
      const [factory, weth] = await Promise.all([
        publicClient.readContract({ address: POTATOPAD_CURVE_ADDRESS as Address, abi: padAbi, functionName: "v3Factory" }),
        publicClient.readContract({ address: POTATOPAD_CURVE_ADDRESS as Address, abi: padAbi, functionName: "weth" }),
      ]);
      if (weth.toLowerCase() !== ROBINHOOD_WETH_ADDRESS.toLowerCase()) throw new Error("unverified wrapped eth configuration");
      const pool = await publicClient.readContract({ address: factory, abi: v3FactoryAbi, functionName: "getPool", args: [token, weth, POTATOPAD_POOL_FEE] });
      if (/^0x0{40}$/i.test(pool)) throw new Error("no supported PotatoPad trading pool was found for that token");
      const targetWeth = usdToWei(op.amount, price);
      const { result: quote } = await publicClient.simulateContract({
        account: request.expectedFrom as Address, address: UNISWAP_V3_QUOTER_ADDRESS as Address,
        abi: quoterAbi, functionName: "quoteExactOutputSingle",
        args: [{ tokenIn: token, tokenOut: weth, amount: targetWeth, fee: POTATOPAD_POOL_FEE, sqrtPriceLimitX96: 0n }],
      });
      rawAmount = quote[0];
    }
    if (rawAmount <= 0n) throw new Error(op.type === "erc20_burn_to_dead" ? "burn amount must be positive" : "send amount must be positive");
    return {
      to: token,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [recipient as Address, rawAmount] }),
      value: 0n,
    };
  }
  if (op.type === "erc20_approve_router") {
    if (op.routerAddress.toLowerCase() !== UNISWAP_V3_ROUTER_ADDRESS.toLowerCase()) throw new Error("unverified swap router");
    const token = await resolveHeldTokenAddress(request.expectedFrom as Address, op.token);
    const decimals = await publicClient.readContract({ address: token, abi: erc20Abi, functionName: "decimals" });
    const amount = await tokenAmount(request.expectedFrom as Address, token, op.amount, op.unit, decimals);
    if (amount <= 0n) throw new Error("approval amount must be positive");
    return {
      to: token,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [UNISWAP_V3_ROUTER_ADDRESS as Address, amount] }),
      value: 0n,
    };
  }
  if (op.type === "uniswap_v3_buy" || op.type === "uniswap_v3_sell") {
    if (op.routerAddress.toLowerCase() !== UNISWAP_V3_ROUTER_ADDRESS.toLowerCase()
      || op.quoterAddress.toLowerCase() !== UNISWAP_V3_QUOTER_ADDRESS.toLowerCase()
      || op.wethAddress.toLowerCase() !== ROBINHOOD_WETH_ADDRESS.toLowerCase()
      || op.fee !== POTATOPAD_POOL_FEE) throw new Error("unverified swap configuration");
    const owner = request.expectedFrom as Address;
    const token = await resolveHeldTokenAddress(owner, op.token);
    const [factory, configuredWeth] = await Promise.all([
      publicClient.readContract({ address: POTATOPAD_CURVE_ADDRESS as Address, abi: padAbi, functionName: "v3Factory" }),
      publicClient.readContract({ address: POTATOPAD_CURVE_ADDRESS as Address, abi: padAbi, functionName: "weth" }),
    ]);
    if (configuredWeth.toLowerCase() !== ROBINHOOD_WETH_ADDRESS.toLowerCase()) throw new Error("unverified wrapped eth configuration");
    const pool = await publicClient.readContract({ address: factory, abi: v3FactoryAbi, functionName: "getPool", args: [token, configuredWeth, POTATOPAD_POOL_FEE] });
    if (/^0x0{40}$/i.test(pool)) throw new Error("no supported PotatoPad trading pool was found for that token");
    const tokenDecimals = await publicClient.readContract({ address: token, abi: erc20Abi, functionName: "decimals" });
    const amountIn = op.type === "uniswap_v3_buy"
      ? (op.unit === "usd" ? usdToWei(op.amount, price) : parseEther(op.amount))
      : await tokenAmount(owner, token, op.amount, op.unit, tokenDecimals);
    if (amountIn <= 0n) throw new Error("trade amount must be positive");
    if (op.type === "uniswap_v3_sell") {
      const [balance, allowance] = await Promise.all([
        publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner] }),
        publicClient.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [owner, UNISWAP_V3_ROUTER_ADDRESS as Address] }),
      ]);
      if (balance < amountIn) throw new Error("insufficient token balance");
      if (allowance < amountIn) throw new Error(`sell approval required for ${token}:${amountIn}`);
    }
    const tokenIn = op.type === "uniswap_v3_buy" ? configuredWeth : token;
    const tokenOut = op.type === "uniswap_v3_buy" ? token : configuredWeth;
    const { result: quote } = await publicClient.simulateContract({
      account: owner, address: UNISWAP_V3_QUOTER_ADDRESS as Address, abi: quoterAbi, functionName: "quoteExactInputSingle",
      args: [{ tokenIn, tokenOut, amountIn, fee: POTATOPAD_POOL_FEE, sqrtPriceLimitX96: 0n }],
    });
    const quotedOut = quote[0];
    const minimumOut = quotedOut * BigInt(10_000 - op.slippageBps) / 10_000n;
    if (minimumOut <= 0n) throw new Error("trade quote returned no output");
    const swap = encodeFunctionData({
      abi: swapRouterAbi, functionName: "exactInputSingle",
      args: [{ tokenIn, tokenOut, fee: POTATOPAD_POOL_FEE, recipient: op.type === "uniswap_v3_buy" ? owner : ROUTER_ADDRESS_THIS, amountIn, amountOutMinimum: minimumOut, sqrtPriceLimitX96: 0n }],
    });
    const calls = op.type === "uniswap_v3_buy" ? [swap] : [swap, encodeFunctionData({
      abi: swapRouterAbi, functionName: "unwrapWETH9", args: [minimumOut, owner],
    })];
    const latestBlock = await publicClient.getBlock();
    return {
      to: UNISWAP_V3_ROUTER_ADDRESS as Address,
      data: encodeFunctionData({ abi: swapRouterAbi, functionName: "multicall", args: [latestBlock.timestamp + 600n, calls] }),
      value: op.type === "uniswap_v3_buy" ? amountIn : 0n,
    };
  }
  if (op.padAddress.toLowerCase() !== POTATOPAD_CURVE_ADDRESS.toLowerCase()) throw new Error("unverified PotatoPad contract");
  if (op.imageUri !== op.meta.imageURI || new URL(op.imageUri).hostname.toLowerCase() !== "pbs.twimg.com") throw new Error("invalid launch image");
  const value = !op.devBuy ? 0n : op.devBuy.unit === "usd" ? usdToWei(op.devBuy.amount, price) : parseEther(op.devBuy.amount);
  if (value > MAX_LAUNCH_DEV_BUY_WEI) throw new Error("initial dev buy exceeds the 0.02627 ETH maximum");
  const vanity = await findVanitySalt(request.idempotencyKey, request.expectedFrom as Address, op.name, op.symbol);
  return {
    to: POTATOPAD_CURVE_ADDRESS as Address,
    data: encodeFunctionData({ abi: padAbi, functionName: "createToken", args: [op.name, op.symbol, op.meta, vanity.salt] }),
    value,
  };
}

export async function executeTransaction(request: ExecutionRequest) {
  if (process.env.X_CRYPTO_EXECUTION_ENABLED !== "true") throw new Error("crypto execution is disabled");
  const maxUsd = Number(process.env.WALLET_MAX_TRANSACTION_USD);
  if (!Number.isFinite(maxUsd) || maxUsd <= 0) throw new Error("maximum transaction value is not configured");
  const account = await accountFor(request.walletRef, request.expectedFrom, request.ownerReference);
  const price = await ethUsd();
  let call = await buildCall(request, price);
  const fees = await publicClient.estimateFeesPerGas();
  const { maxFeePerGas, maxPriorityFeePerGas } = fees;
  if (maxFeePerGas === undefined || maxFeePerGas <= 0n) throw new Error("fee estimate unavailable");
  const priorityFee = maxPriorityFeePerGas ?? 0n;
  const balance = await publicClient.getBalance({ address: account.address });

  if (balance === 0n) throw new Error("insufficient ETH for gas");
  if (request.operation.type === "eth_transfer" && request.operation.unit !== "percent" && balance <= call.value) {
    throw new Error("ETH transfer amount plus gas exceeds wallet balance");
  }

  let estimatedGas: bigint;
  try {
    estimatedGas = await publicClient.estimateGas({
      account: account.address,
      ...call,
      ...(request.operation.type === "eth_transfer" && request.operation.unit === "percent" ? { value: 1n } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/insufficient funds|insufficient balance/i.test(message)) {
      throw new Error(request.operation.type === "eth_transfer"
        ? "ETH transfer amount plus gas exceeds wallet balance"
        : "insufficient ETH for gas");
    }
    throw error;
  }
  let gas = estimatedGas * 125n / 100n;

  if (request.operation.type === "eth_transfer" && request.operation.unit === "percent") {
    const scaledPercent = parseUnits(request.operation.amount, 4);
    if (scaledPercent <= 0n || scaledPercent > 1_000_000n) throw new Error("percentage must be greater than zero and no more than 100");
    const maximumGasCost = gas * maxFeePerGas;
    if (balance <= maximumGasCost) throw new Error("insufficient ETH for gas");
    const requestedValue = scaledPercent === 1_000_000n
      ? balance - maximumGasCost
      : balance * scaledPercent / 1_000_000n;
    call = { ...call, value: requestedValue };
    try {
      estimatedGas = await publicClient.estimateGas({ account: account.address, ...call });
      gas = estimatedGas * 125n / 100n;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      // Some RPC nodes reject an all-balance estimate because they independently
      // add gas to the supplied value. The buffered estimate made with one wei
      // remains valid for an ordinary native transfer.
      if (scaledPercent !== 1_000_000n || !/insufficient funds|insufficient balance/i.test(message)) throw error;
    }
    const finalGasCost = gas * maxFeePerGas;
    if (scaledPercent === 1_000_000n) {
      if (balance <= finalGasCost) throw new Error("insufficient ETH for gas");
      call = { ...call, value: balance - finalGasCost };
    } else if (balance < call.value + finalGasCost) {
      throw new Error("ETH transfer amount plus gas exceeds wallet balance");
    }
  } else {
    const maximumGasCost = gas * maxFeePerGas;
    if (balance < maximumGasCost) throw new Error("insufficient ETH for gas");
    if (balance < call.value + maximumGasCost) {
      throw new Error(request.operation.type === "eth_transfer"
        ? "ETH transfer amount plus gas exceeds wallet balance"
        : "insufficient ETH for gas");
    }
  }

  const valueUsd = Number(formatEther(call.value)) * price;
  if (valueUsd > maxUsd) throw new Error("transaction exceeds the configured value limit");
  await publicClient.call({ account: account.address, ...call });
  const nonce = await publicClient.getTransactionCount({ address: account.address, blockTag: "pending" });
  const unsigned = serializeTransaction({
    chainId: ROBINHOOD_CHAIN_ID,
    type: "eip1559",
    nonce,
    gas,
    maxFeePerGas,
    maxPriorityFeePerGas: priorityFee,
    ...call,
  });
  const signed = await cdpClient().evm.signTransaction({ address: account.address, transaction: unsigned, idempotencyKey: request.idempotencyKey });
  return {
    transactionHash: keccak256(signed.signature), status: "prepared" as const,
    signedTransaction: signed.signature, valueWei: call.value.toString(),
  };
}

export async function broadcastTransaction(request: BroadcastRequest) {
  await accountFor(request.walletRef, request.expectedFrom, request.ownerReference);
  const signedTransaction = request.signedTransaction as Hex;
  if (keccak256(signedTransaction).toLowerCase() !== request.transactionHash.toLowerCase()) throw new Error("signed transaction hash mismatch");
  try {
    const submittedHash = await publicClient.sendRawTransaction({ serializedTransaction: signedTransaction });
    if (submittedHash.toLowerCase() !== request.transactionHash.toLowerCase()) throw new Error("broadcast transaction hash mismatch");
  } catch (error) {
    const message = error instanceof Error ? error.message : "broadcast failed";
    if (!/already known|known transaction|nonce too low/i.test(message)) throw error;
  }
  try {
    const receipt = await publicClient.waitForTransactionReceipt({ hash: request.transactionHash as Hex, confirmations: 1, timeout: 20_000 });
    return receiptResult(receipt, request.operationType, request.expectedFrom as Address, BigInt(request.expectedValueWei));
  } catch {
    return { transactionHash: request.transactionHash, status: "broadcast" as const, valueWei: request.expectedValueWei };
  }
}

function receiptResult(
  receipt: Awaited<ReturnType<typeof publicClient.getTransactionReceipt>>,
  operationType: TransactionStatusRequest["operationType"],
  expectedFrom: Address,
  expectedValue: bigint,
) {
  if (receipt.status !== "success") {
    return { transactionHash: receipt.transactionHash, status: "reverted" as const, blockNumber: receipt.blockNumber.toString(), valueWei: expectedValue.toString() };
  }
  let tokenAddress: string | undefined;
  let poolAddress: string | undefined;
  let positionId: string | undefined;
  let devBuySucceeded = false;
  let feeCollectionVerified = false;
  if (operationType === "potatopad_launch") {
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== POTATOPAD_CURVE_ADDRESS.toLowerCase()) continue;
      try {
        const event = decodeEventLog({ abi: padAbi, data: log.data, topics: log.topics });
        if (event.eventName === "TokenCreated") {
          if (String(event.args.creator).toLowerCase() !== expectedFrom.toLowerCase()) throw new Error("launch creator mismatch");
          if (tokenAddress && String(event.args.token).toLowerCase() !== tokenAddress.toLowerCase()) throw new Error("launch token event mismatch");
          if (poolAddress && String(event.args.pool).toLowerCase() !== poolAddress.toLowerCase()) throw new Error("launch pool event mismatch");
          tokenAddress = String(event.args.token);
          poolAddress = String(event.args.pool);
        }
        if (event.eventName === "CurveOpened") {
          if (tokenAddress && String(event.args.token).toLowerCase() !== tokenAddress.toLowerCase()) throw new Error("launch token event mismatch");
          if (poolAddress && String(event.args.pool).toLowerCase() !== poolAddress.toLowerCase()) throw new Error("launch pool event mismatch");
          tokenAddress ||= String(event.args.token);
          poolAddress ||= String(event.args.pool);
          positionId = String(event.args.positionId);
        }
        if (event.eventName === "DevBuy") {
          if (String(event.args.creator).toLowerCase() !== expectedFrom.toLowerCase()) throw new Error("dev buy creator mismatch");
          if (tokenAddress && String(event.args.token).toLowerCase() !== tokenAddress.toLowerCase()) throw new Error("dev buy token mismatch");
          if (BigInt(event.args.ethIn) !== expectedValue) throw new Error("dev buy value mismatch");
          devBuySucceeded = true;
        }
      } catch (error) {
        if (error instanceof Error && /mismatch/.test(error.message)) throw error;
      }
    }
    if (!tokenAddress || !poolAddress || !positionId) throw new Error("launch receipt was missing required verified events");
    if (!tokenAddress.toLowerCase().startsWith("0x7a70")) throw new Error("launch token address is missing the required 0x7a70 prefix");
    if (expectedValue > 0n && !devBuySucceeded) throw new Error("launch receipt was missing the dev buy event");
  }
  if (operationType === "potatopad_creator_fee_claim") {
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== POTATOPAD_LOCKER_ADDRESS.toLowerCase()) continue;
      try {
        const event = decodeEventLog({ abi: lockerAbi, data: log.data, topics: log.topics });
        if (event.eventName === "FeesCollected") {
          if (String(event.args.caller).toLowerCase() !== expectedFrom.toLowerCase()) throw new Error("fee collection caller mismatch");
          feeCollectionVerified = true;
        }
        if (event.eventName === "FeesClaimed" && String(event.args.beneficiary).toLowerCase() !== expectedFrom.toLowerCase()) {
          throw new Error("fee claim beneficiary mismatch");
        }
      } catch (error) {
        if (error instanceof Error && /mismatch/.test(error.message)) throw error;
      }
    }
    if (!feeCollectionVerified) throw new Error("fee claim receipt was missing the verified collection event");
  }
  return {
    transactionHash: receipt.transactionHash, status: "confirmed" as const, blockNumber: receipt.blockNumber.toString(),
    valueWei: expectedValue.toString(), tokenAddress, poolAddress, positionId,
    ...(operationType === "potatopad_launch" ? { devBuySucceeded } : {}),
  };
}

export async function transactionStatus(request: TransactionStatusRequest) {
  await accountFor(request.walletRef, request.expectedFrom, request.ownerReference);
  const transaction = await publicClient.getTransaction({ hash: request.transactionHash as Hex }).catch(() => null);
  if (!transaction) return { transactionHash: request.transactionHash, status: "pending" as const };
  if (transaction.from.toLowerCase() !== request.expectedFrom.toLowerCase()) throw new Error("transaction sender mismatch");
  if (transaction.value !== BigInt(request.expectedValueWei)) throw new Error("transaction value mismatch");
  const receipt = await publicClient.getTransactionReceipt({ hash: request.transactionHash as Hex }).catch(() => null);
  if (!receipt) return { transactionHash: request.transactionHash, status: "broadcast" as const, valueWei: request.expectedValueWei };
  return receiptResult(receipt, request.operationType, request.expectedFrom as Address, BigInt(request.expectedValueWei));
}
