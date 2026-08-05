import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { isValueMovingCommand, parseWalletCommand, type WalletCommand } from "./walletCommands";

const ROBINHOOD_CHAIN_ID = 4663;
const NON_PREMIUM_DAILY_LIMIT = 10;
const PREMIUM_DAILY_LIMIT = 50;
const PROVISIONING_LEASE_MS = 2 * 60_000;
const DEAD_ADDRESS = "0x000000000000000000000000000000000000dEaD";
const VERIFIED_CURVE_PAD = "0xbE2aCD9044516399aa4C697c299571664fBe9d4B";
const VERIFIED_FEE_LOCKER = "0x47eC8916647007c66985aa316f70C44Dd41D75EB";
const VERIFIED_SWAP_ROUTER = "0xcaf681a66d020601342297493863e78c959e5cb2";
const VERIFIED_SWAP_QUOTER = "0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7";
const VERIFIED_WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
const DEFAULT_GAS_RESERVE_USD = "0.50";
const DEFAULT_LAUNCH_WEBSITE = "https://0x7a70.wiki";
const DEFAULT_LAUNCH_DESCRIPTION = "Launched on X to PotatoPad via @0x7a70.";
const ROBINHOOD_EXPLORER_TX_BASE = "https://robinhoodchain.blockscout.com/tx";

type SignerWallet = { walletRef: string; address: string };
type SubmittedTransaction = {
  transactionHash: string;
  status: "prepared" | "broadcast" | "pending" | "confirmed" | "reverted";
  signedTransaction?: string;
  blockNumber?: string;
  valueWei?: string;
  tokenAddress?: string;
  poolAddress?: string;
  positionId?: string;
  devBuySucceeded?: boolean;
};
type CommandResult = { ok: boolean; message: string; transactionHash?: string };

function executionEnabled() {
  return process.env.X_CRYPTO_EXECUTION_ENABLED === "true";
}

function safeAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function transactionUrl(transactionHash: string) {
  return `${ROBINHOOD_EXPLORER_TX_BASE}/${transactionHash}`;
}

function signerConfiguration() {
  const baseUrl = process.env.WALLET_SIGNER_URL?.replace(/\/$/, "");
  const token = process.env.WALLET_SIGNER_TOKEN;
  if (!baseUrl || !token) throw new Error("secure wallet signer is not configured");
  return { baseUrl, token };
}

async function signerRequest<T>(path: string, body: unknown): Promise<T> {
  const { baseUrl, token } = signerConfiguration();

  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const raw = await response.text();

  let payload: (T & { error?: string; message?: string }) | null = null;

  try {
    payload = raw
      ? (JSON.parse(raw) as T & { error?: string; message?: string })
      : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(
      payload?.error ||
        payload?.message ||
        `signer request failed (${response.status}): ${raw || response.statusText}`,
    );
  }

  if (!payload) {
    throw new Error(
      `signer returned invalid or empty JSON (${response.status}): ${raw}`,
    );
  }

  return payload;
}

async function provisionSignerWallet(xUserId: string): Promise<SignerWallet> {
  const wallet = await signerRequest<SignerWallet>("/v1/wallets", {
    idempotencyKey: `x:${xUserId}:robinhood`,
    ownerReference: `x:${xUserId}`,
    chainId: ROBINHOOD_CHAIN_ID,
  });
  if (!wallet.walletRef || !safeAddress(wallet.address)) throw new Error("signer returned an invalid wallet");
  return wallet;
}

async function normalizeImage(mediaUrl?: string) {
  if (!mediaUrl) return "";
  const url = new URL(mediaUrl);
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "pbs.twimg.com") {
    throw new Error("token image must be an attached X image");
  }
  return url.toString();
}

export const upsertXUser = internalMutation({
  args: {
    xUserId: v.string(), username: v.string(), verified: v.boolean(),
    verifiedType: v.optional(v.string()), subscriptionType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db.query("xReplyUsers").withIndex("by_x_user_id", (q) => q.eq("xUserId", args.xUserId)).unique();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("xReplyUsers", { ...args, walletStatus: "none", createdAt: now, updatedAt: now });
  },
});

export const getXUserAndWallet = internalQuery({
  args: { xUserId: v.string() },
  handler: async (ctx, { xUserId }) => {
    const user = await ctx.db.query("xReplyUsers").withIndex("by_x_user_id", (q) => q.eq("xUserId", xUserId)).unique();
    const wallet = user?.walletId ? await ctx.db.get(user.walletId) : null;
    return user ? { user, wallet } : null;
  },
});

export const resolveClaimToken = internalQuery({
  args: { ownerXUserId: v.string(), identifier: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const launches = await ctx.db.query("tokenLaunches")
      .withIndex("by_owner_created_at", (q) => q.eq("ownerXUserId", args.ownerXUserId))
      .order("desc")
      .take(100);
    const completed = launches.filter((launch) => launch.tokenAddress);
    const identifier = args.identifier?.trim();
    if (!identifier) {
      if (completed.length === 1) return completed[0].tokenAddress!;
      throw new Error(completed.length ? "specify the token contract or ticker for the fee claim" : "no completed PotatoPad launch was found for this wallet");
    }
    const normalized = identifier.replace(/^\$/, "").toLowerCase();
    const matches = completed.filter((launch) =>
      launch.tokenAddress!.toLowerCase() === normalized || launch.symbol.toLowerCase() === normalized,
    );
    if (matches.length !== 1) throw new Error(matches.length ? "that ticker matches more than one launch; use the token contract" : "that launch was not found for this wallet");
    return matches[0].tokenAddress!;
  },
});

export const beginWalletProvisioning = internalMutation({
  args: { xUserId: v.string() },
  handler: async (ctx, { xUserId }) => {
    const user = await ctx.db.query("xReplyUsers").withIndex("by_x_user_id", (q) => q.eq("xUserId", xUserId)).unique();
    if (!user) throw new Error("X user is not registered");
    if (user.walletId) return { needed: false, walletId: user.walletId };
    if (user.walletStatus === "provisioning" && Date.now() - user.updatedAt < PROVISIONING_LEASE_MS) return { needed: false };
    await ctx.db.patch(user._id, { walletStatus: "provisioning", updatedAt: Date.now() });
    return { needed: true };
  },
});

export const finishWalletProvisioning = internalMutation({
  args: { xUserId: v.string(), address: v.string(), signerWalletRef: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db.query("xReplyUsers").withIndex("by_x_user_id", (q) => q.eq("xUserId", args.xUserId)).unique();
    if (!user) throw new Error("X user is not registered");
    if (user.walletId) {
      const linked = await ctx.db.get(user.walletId);
      if (!linked || linked.ownerXUserId !== args.xUserId || linked.chainId !== ROBINHOOD_CHAIN_ID
        || linked.address.toLowerCase() !== args.address.toLowerCase()
        || linked.signerWalletRef.toLowerCase() !== args.signerWalletRef.toLowerCase()) {
        throw new Error("canonical X wallet binding mismatch");
      }
      return linked._id;
    }
    const existing = await ctx.db.query("cryptoWallets").withIndex("by_owner_x_user_id", (q) => q.eq("ownerXUserId", args.xUserId)).unique();
    const addressOwner = await ctx.db.query("cryptoWallets").withIndex("by_address", (q) => q.eq("address", args.address)).unique();
    if (addressOwner && addressOwner.ownerXUserId !== args.xUserId) throw new Error("wallet address is already bound to another X user");
    if (existing && (existing.address.toLowerCase() !== args.address.toLowerCase()
      || existing.signerWalletRef.toLowerCase() !== args.signerWalletRef.toLowerCase()
      || existing.chainId !== ROBINHOOD_CHAIN_ID)) throw new Error("canonical X wallet binding mismatch");
    const now = Date.now();
    const walletId = existing?._id || await ctx.db.insert("cryptoWallets", {
      ownerXUserId: args.xUserId, address: args.address, signerWalletRef: args.signerWalletRef,
      chainId: ROBINHOOD_CHAIN_ID, status: "active", createdAt: now, updatedAt: now,
    });
    await ctx.db.patch(user._id, { walletId, walletStatus: "active", updatedAt: now });
    return walletId;
  },
});

export const resetWalletProvisioning = internalMutation({
  args: { xUserId: v.string() },
  handler: async (ctx, { xUserId }) => {
    const user = await ctx.db.query("xReplyUsers").withIndex("by_x_user_id", (q) => q.eq("xUserId", xUserId)).unique();
    if (user && !user.walletId) await ctx.db.patch(user._id, { walletStatus: "none", updatedAt: Date.now() });
  },
});

export const consumeWalletLimit = internalMutation({
  args: { xUserId: v.string(), premium: v.boolean() },
  handler: async (ctx, args) => {
    const dailyLimit = args.premium ? PREMIUM_DAILY_LIMIT : NON_PREMIUM_DAILY_LIMIT;
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    const record = await ctx.db.query("walletRateLimits").withIndex("by_owner_x_user_id", (q) => q.eq("ownerXUserId", args.xUserId)).unique();
    const current = record?.day === day ? record.count : 0;
    if (current >= dailyLimit) return { allowed: false, count: current, remaining: 0 };
    const count = current + 1;
    if (record) await ctx.db.patch(record._id, { day, count, updatedAt: now });
    else await ctx.db.insert("walletRateLimits", { ownerXUserId: args.xUserId, day, count, updatedAt: now });
    return { allowed: true, count, remaining: dailyLimit - count };
  },
});

export const reserveWalletRequest = internalMutation({
  args: { requestId: v.string(), sourcePostId: v.string(), ownerXUserId: v.string(), walletId: v.id("cryptoWallets"), kind: v.string(), normalizedJson: v.string() },
  handler: async (ctx, args) => {
    const duplicate = await ctx.db.query("walletRequests").withIndex("by_request_id", (q) => q.eq("requestId", args.requestId)).unique();
    if (duplicate) {
      if (duplicate.status === "failed" && !duplicate.transactionHash && Date.now() - duplicate.updatedAt >= 30_000) {
        await ctx.db.patch(duplicate._id, { status: "accepted", safeError: undefined, updatedAt: Date.now() });
        return { inserted: true, retried: true, request: await ctx.db.get(duplicate._id) };
      }
      return { inserted: false, retried: false, request: duplicate };
    }
    const now = Date.now();
    const id = await ctx.db.insert("walletRequests", { ...args, status: "accepted", createdAt: now, updatedAt: now });
    return { inserted: true, retried: false, request: await ctx.db.get(id) };
  },
});

export const updateWalletRequest = internalMutation({
  args: {
    requestId: v.string(),
    status: v.union(v.literal("accepted"), v.literal("simulating"), v.literal("prepared"), v.literal("broadcast"), v.literal("confirmed"), v.literal("rejected"), v.literal("failed")),
    safeError: v.optional(v.string()), transactionHash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.query("walletRequests").withIndex("by_request_id", (q) => q.eq("requestId", args.requestId)).unique();
    if (request) await ctx.db.patch(request._id, { status: args.status, safeError: args.safeError, transactionHash: args.transactionHash, updatedAt: Date.now() });
  },
});

const launchRecordValidator = v.object({
  ownerXUserId: v.string(), launchMode: v.literal("curve"),
  name: v.string(), symbol: v.string(), imageUri: v.string(), devBuyWei: v.string(),
  description: v.optional(v.string()), website: v.optional(v.string()),
  twitter: v.optional(v.string()), telegram: v.optional(v.string()),
  tokenAddress: v.optional(v.string()), poolAddress: v.optional(v.string()),
  positionId: v.optional(v.string()), devBuySucceeded: v.optional(v.boolean()),
});

export const recordPreparedExecution = internalMutation({
  args: {
    requestId: v.string(), walletId: v.id("cryptoWallets"), to: v.string(), valueWei: v.string(),
    callKind: v.string(), transactionHash: v.string(), signedTransaction: v.string(), launch: v.optional(launchRecordValidator),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db.query("walletTransactions").withIndex("by_request_id", (q) => q.eq("requestId", args.requestId)).unique();
    if (!existing) await ctx.db.insert("walletTransactions", {
      requestId: args.requestId, walletId: args.walletId, chainId: ROBINHOOD_CHAIN_ID,
      to: args.to, valueWei: args.valueWei, callKind: args.callKind,
      transactionHash: args.transactionHash, signedTransaction: args.signedTransaction,
      status: "prepared", createdAt: now, updatedAt: now,
    });
    if (args.launch) {
      const launch = await ctx.db.query("tokenLaunches").withIndex("by_request_id", (q) => q.eq("requestId", args.requestId)).unique();
      if (!launch) await ctx.db.insert("tokenLaunches", {
        requestId: args.requestId, walletId: args.walletId, transactionHash: args.transactionHash,
        ...args.launch, createdAt: now, updatedAt: now,
      });
    }
    const request = await ctx.db.query("walletRequests").withIndex("by_request_id", (q) => q.eq("requestId", args.requestId)).unique();
    if (request) await ctx.db.patch(request._id, {
      status: "prepared", transactionHash: args.transactionHash, reconciliationAttempts: 0,
      nextReconcileAt: now, updatedAt: now,
    });
  },
});

export const markTransactionBroadcast = internalMutation({
  args: { requestId: v.string() },
  handler: async (ctx, { requestId }) => {
    const now = Date.now();
    const request = await ctx.db.query("walletRequests").withIndex("by_request_id", (q) => q.eq("requestId", requestId)).unique();
    if (request && request.status === "prepared") await ctx.db.patch(request._id, { status: "broadcast", nextReconcileAt: now + 15_000, updatedAt: now });
    const transaction = await ctx.db.query("walletTransactions").withIndex("by_request_id", (q) => q.eq("requestId", requestId)).unique();
    if (transaction && transaction.status === "prepared") await ctx.db.patch(transaction._id, { status: "broadcast", updatedAt: now });
    await ctx.scheduler.runAfter(15_000, internal.wallets.reconcileTransaction, { requestId });
  },
});

export const recordConfirmedExecution = internalMutation({
  args: {
    requestId: v.string(), walletId: v.id("cryptoWallets"), to: v.string(), valueWei: v.string(),
    callKind: v.string(), transactionHash: v.string(), blockNumber: v.optional(v.string()),
    launch: v.optional(launchRecordValidator),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("walletTransactions").withIndex("by_request_id", (q) => q.eq("requestId", args.requestId)).unique();
    const now = Date.now();
    if (!existing) await ctx.db.insert("walletTransactions", {
      requestId: args.requestId, walletId: args.walletId, chainId: ROBINHOOD_CHAIN_ID,
      to: args.to, valueWei: args.valueWei, callKind: args.callKind,
      transactionHash: args.transactionHash, status: "confirmed", blockNumber: args.blockNumber,
      createdAt: now, updatedAt: now,
    });
    else await ctx.db.patch(existing._id, { status: "confirmed", blockNumber: args.blockNumber, updatedAt: now });
    if (args.launch) {
      const launch = await ctx.db.query("tokenLaunches").withIndex("by_request_id", (q) => q.eq("requestId", args.requestId)).unique();
      const launchId = launch?._id || await ctx.db.insert("tokenLaunches", {
        requestId: args.requestId, walletId: args.walletId, transactionHash: args.transactionHash,
        ...args.launch, createdAt: now, updatedAt: now,
      });
      if (launch) await ctx.db.patch(launch._id, { ...args.launch, updatedAt: now });
      if (args.launch.tokenAddress && !launch?.patchEventCreatedAt) {
        await ctx.db.insert("events", {
          type: "token_launched",
          potatoSlug: "0x7a70",
          potatoName: "0x7a70",
          tokenAddress: args.launch.tokenAddress,
          tokenName: args.launch.name,
          tokenSymbol: args.launch.symbol,
          text: `0x7a70 planted ${args.launch.name} (${args.launch.symbol}) through PotatoPad. contract ${args.launch.tokenAddress}.`,
          createdAt: now,
        });
        await ctx.db.patch(launchId, { patchEventCreatedAt: now, updatedAt: now });
        await ctx.scheduler.runAfter(0, internal.telegram.announceTokenLaunch, { requestId: args.requestId });
      }
    }
    const request = await ctx.db.query("walletRequests").withIndex("by_request_id", (q) => q.eq("requestId", args.requestId)).unique();
    if (request) await ctx.db.patch(request._id, { status: "confirmed", transactionHash: args.transactionHash, nextReconcileAt: undefined, updatedAt: now });
  },
});

export const getReconciliationContext = internalQuery({
  args: { requestId: v.string() },
  handler: async (ctx, { requestId }) => {
    const request = await ctx.db.query("walletRequests").withIndex("by_request_id", (q) => q.eq("requestId", requestId)).unique();
    if (!request) return null;
    const wallet = await ctx.db.get(request.walletId);
    const transaction = await ctx.db.query("walletTransactions").withIndex("by_request_id", (q) => q.eq("requestId", requestId)).unique();
    const launch = await ctx.db.query("tokenLaunches").withIndex("by_request_id", (q) => q.eq("requestId", requestId)).unique();
    return { request, wallet, transaction, launch };
  },
});

export const deferReconciliation = internalMutation({
  args: { requestId: v.string(), attempt: v.number() },
  handler: async (ctx, args) => {
    const request = await ctx.db.query("walletRequests").withIndex("by_request_id", (q) => q.eq("requestId", args.requestId)).unique();
    if (!request || (request.status !== "prepared" && request.status !== "broadcast")) return;
    const delay = Math.min(15 * 60_000, 15_000 * 2 ** Math.min(args.attempt, 6));
    await ctx.db.patch(request._id, { reconciliationAttempts: args.attempt, nextReconcileAt: Date.now() + delay, updatedAt: Date.now() });
    await ctx.scheduler.runAfter(delay, internal.wallets.reconcileTransaction, { requestId: args.requestId });
  },
});

export const recordRevertedExecution = internalMutation({
  args: { requestId: v.string(), blockNumber: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const request = await ctx.db.query("walletRequests").withIndex("by_request_id", (q) => q.eq("requestId", args.requestId)).unique();
    if (request) await ctx.db.patch(request._id, { status: "failed", safeError: "transaction reverted", nextReconcileAt: undefined, updatedAt: now });
    const transaction = await ctx.db.query("walletTransactions").withIndex("by_request_id", (q) => q.eq("requestId", args.requestId)).unique();
    if (transaction) await ctx.db.patch(transaction._id, { status: "reverted", blockNumber: args.blockNumber, updatedAt: now });
  },
});

export const reconcileTransaction = internalAction({
  args: { requestId: v.string() },
  handler: async (ctx, args) => {
    const current = await ctx.runQuery(internal.wallets.getReconciliationContext, args);
    if (!current?.wallet || !current.transaction || !["prepared", "broadcast"].includes(current.request.status) || !current.request.transactionHash) return;
    try {
      const statusBody = {
        chainId: ROBINHOOD_CHAIN_ID,
        ownerReference: `x:${current.request.ownerXUserId}`,
        walletRef: current.wallet.signerWalletRef,
        expectedFrom: current.wallet.address,
        transactionHash: current.request.transactionHash,
        operationType: current.transaction.callKind,
        expectedValueWei: current.transaction.valueWei,
      };
      const result = current.request.status === "prepared"
        ? await signerRequest<SubmittedTransaction>("/v1/transactions/broadcast", {
          ...statusBody, signedTransaction: current.transaction.signedTransaction,
        })
        : await signerRequest<SubmittedTransaction>("/v1/transactions/status", statusBody);
      if (result.status === "broadcast" || result.status === "pending") {
        if (current.request.status === "prepared") await ctx.runMutation(internal.wallets.markTransactionBroadcast, { requestId: args.requestId });
        else await ctx.runMutation(internal.wallets.deferReconciliation, { requestId: args.requestId, attempt: (current.request.reconciliationAttempts || 0) + 1 });
        return;
      }
      if (result.status === "reverted") {
        await ctx.runMutation(internal.wallets.recordRevertedExecution, { requestId: args.requestId, blockNumber: result.blockNumber });
        return;
      }
      if (current.request.kind === "launch" && (!result.tokenAddress || !result.poolAddress || !result.positionId)) throw new Error("launch receipt was incomplete");
      const launch = current.launch ? {
        ownerXUserId: current.launch.ownerXUserId, launchMode: current.launch.launchMode,
        name: current.launch.name, symbol: current.launch.symbol, imageUri: current.launch.imageUri,
        description: current.launch.description, website: current.launch.website, twitter: current.launch.twitter,
        telegram: current.launch.telegram, devBuyWei: result.valueWei || current.launch.devBuyWei,
        tokenAddress: result.tokenAddress, poolAddress: result.poolAddress, positionId: result.positionId,
        devBuySucceeded: result.devBuySucceeded,
      } : undefined;
      await ctx.runMutation(internal.wallets.recordConfirmedExecution, {
        requestId: args.requestId, walletId: current.wallet._id, to: current.transaction.to,
        valueWei: result.valueWei || current.transaction.valueWei, callKind: current.transaction.callKind,
        transactionHash: current.request.transactionHash, blockNumber: result.blockNumber, launch,
      });
    } catch (error) {
      console.error("wallet_reconciliation_failed", { requestId: args.requestId, message: error instanceof Error ? error.message : "unknown" });
      await ctx.runMutation(internal.wallets.deferReconciliation, { requestId: args.requestId, attempt: (current.request.reconciliationAttempts || 0) + 1 });
    }
  },
});

function isPremium(subscriptionType?: string) {
  return subscriptionType === "Premium" || subscriptionType === "PremiumPlus";
}

function safeFailure(error: unknown) {
  const message = error instanceof Error ? error.message : "wallet request failed";
  if (/reserve|ending balance/i.test(message)) return "that would leave too little eth for the next root fee";
  if (/insufficient/i.test(message)) return "insufficient funds for the amount and gas";
  if (/image/i.test(message)) return "the token image could not be prepared";
  if (/specify the token|ticker matches|launch was not found|no completed PotatoPad launch/i.test(message)) return message;
  if (/launch creator|fee beneficiary/i.test(message)) return "that wallet is not authorized to claim fees for this launch";
  if (/locker relationship|position assets/i.test(message)) return "the launch could not be matched to the verified PotatoPad fee locker";
  if (/held token|contract address|token lookup/i.test(message)) return message;
  if (/pool|liquidity|quote returned no output/i.test(message)) return "no usable trading route or liquidity was found for that token";
  if (/slippage/i.test(message)) return "the trade moved beyond the requested slippage before it could be confirmed";
  if (/0\.02627 ETH maximum|initial dev buy exceeds/i.test(message)) return "the maximum initial dev buy is 0.02627 eth";
  if (/disabled|not configured|unavailable/i.test(message)) return "that root is not available yet";
  if (/revert|simulation/i.test(message)) return "the transaction was rejected during its safety check";
  return "the root line failed before confirmation";
}

async function submit(wallet: { signerWalletRef: string; address: string }, xUserId: string, requestId: string, operation: Record<string, unknown>) {
  if (!executionEnabled()) throw new Error("crypto execution is disabled");
  const reserveUsd = process.env.WALLET_MIN_GAS_RESERVE_USD || DEFAULT_GAS_RESERVE_USD;
  if (!/^\d+(?:\.\d{1,2})?$/.test(reserveUsd) || Number(reserveUsd) <= 0) {
    throw new Error("wallet gas reserve is not configured safely");
  }
  return await signerRequest<SubmittedTransaction>("/v1/transactions/execute", {
    idempotencyKey: requestId,
    ownerReference: `x:${xUserId}`,
    chainId: ROBINHOOD_CHAIN_ID,
    walletRef: wallet.signerWalletRef,
    expectedFrom: wallet.address,
    requireSimulation: true,
    balancePolicy: {
      nativeAsset: "ETH",
      minimumEndingBalanceUsd: reserveUsd,
      quoteAtExecution: true,
      includeMaximumGasCost: true,
      failClosedWhenQuoteUnavailable: true,
    },
    operation,
  });
}

export const ensureWallet = internalAction({
  args: { xUserId: v.string() },
  handler: async (ctx, { xUserId }): Promise<Doc<"cryptoWallets"> | null> => {
    const current = await ctx.runQuery(internal.wallets.getXUserAndWallet, { xUserId });
    if (current?.wallet) {
      if (current.wallet.ownerXUserId !== xUserId || current.wallet.chainId !== ROBINHOOD_CHAIN_ID) {
        throw new Error("canonical X wallet binding mismatch");
      }
      return current.wallet;
    }
    const reservation = await ctx.runMutation(internal.wallets.beginWalletProvisioning, { xUserId });
    if (!reservation.needed) {
      // A concurrent delivery may be provisioning the same idempotent wallet.
      await new Promise((resolve) => setTimeout(resolve, 500));
      return (await ctx.runQuery(internal.wallets.getXUserAndWallet, { xUserId }))?.wallet || null;
    }
    try {
      const wallet = await provisionSignerWallet(xUserId);
      await ctx.runMutation(internal.wallets.finishWalletProvisioning, { xUserId, address: wallet.address, signerWalletRef: wallet.walletRef });
      return (await ctx.runQuery(internal.wallets.getXUserAndWallet, { xUserId }))?.wallet || null;
    } catch (error) {
      await ctx.runMutation(internal.wallets.resetWalletProvisioning, { xUserId });
      throw error;
    }
  },
});

export const executeCommand = internalAction({
  args: {
    sourcePostId: v.string(), xUserId: v.string(), text: v.string(),
    mediaUrl: v.optional(v.string()), recipientAddress: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<CommandResult> => {
    const command = parseWalletCommand(args.text);
    const userContext = await ctx.runQuery(internal.wallets.getXUserAndWallet, { xUserId: args.xUserId });
    if (!userContext) return { ok: false, message: "the account could not be bound to the root" };
    let wallet = userContext.wallet;
    try {
      wallet ||= await ctx.runAction(internal.wallets.ensureWallet, { xUserId: args.xUserId });
    } catch (error) {
      return { ok: false, message: safeFailure(error) };
    }
    if (!wallet || wallet.status !== "active") return { ok: false, message: "the wallet root is unavailable" };
   if (command.kind === "create_wallet" || command.kind === "show_wallet") {
  const explorerUrl =
    `https://robinhoodchain.blockscout.com/address/${wallet.address}`;

  return {
    ok: true,
    message: `robinhood chain wallet: ${explorerUrl}`,
  };
}
    if (command.kind === "show_balance") {
      try {
        const balance = await signerRequest<{ display: string }>("/v1/wallets/balance", {
          chainId: ROBINHOOD_CHAIN_ID, walletRef: wallet.signerWalletRef,
          expectedAddress: wallet.address, ownerReference: `x:${args.xUserId}`,
          token: command.token || "ETH",
        });
        return { ok: true, message: `${command.token || "eth"} balance: ${balance.display}` };
      } catch (error) {
        return { ok: false, message: safeFailure(error) };
      }
    }
    if (command.kind === "unknown") return { ok: false, message: command.reason };

    const requestId = `x:${args.sourcePostId}:${command.kind}`;
    const reserved = await ctx.runMutation(internal.wallets.reserveWalletRequest, {
      requestId, sourcePostId: args.sourcePostId, ownerXUserId: args.xUserId,
      walletId: wallet._id, kind: command.kind, normalizedJson: JSON.stringify(command),
    });
    if (!reserved.inserted) {
      const prior = reserved.request;
      return {
        ok: prior?.status === "confirmed",
        message: prior?.transactionHash
          ? `already processed: ${transactionUrl(prior.transactionHash)}`
          : "this command is already being processed",
        ...(prior?.transactionHash ? { transactionHash: prior.transactionHash } : {}),
      };
    }

    if (command.kind === "launch" && !userContext.user.verified) {
      await ctx.runMutation(internal.wallets.updateWalletRequest, { requestId, status: "rejected", safeError: "verified X account required" });
      return { ok: false, message: "only verified accounts can plant tokens" };
    }
    if (isValueMovingCommand(command)) {
      const limit = reserved.retried
        ? { allowed: true, count: 0, remaining: null as number | null }
        : await ctx.runMutation(internal.wallets.consumeWalletLimit, {
          xUserId: args.xUserId, premium: isPremium(userContext.user.subscriptionType),
        });
      if (!limit.allowed) {
        await ctx.runMutation(internal.wallets.updateWalletRequest, { requestId, status: "rejected", safeError: "daily wallet limit reached" });
        return { ok: false, message: "today's wallet action limit has already been reached" };
      }
      const warning = limit.remaining === 2 ? " 2 wallet actions remain today." : limit.remaining === 1 ? " 1 wallet action remains today." : limit.remaining === 0 ? " today's wallet limit is now exhausted." : "";
      try {
        await ctx.runMutation(internal.wallets.updateWalletRequest, { requestId, status: "simulating" });
        const claimToken = command.kind === "claim_fees"
          ? await ctx.runQuery(internal.wallets.resolveClaimToken, { ownerXUserId: args.xUserId, identifier: command.token })
          : undefined;
        const operation = await operationFor(command, args.mediaUrl, claimToken, args.recipientAddress, userContext.user.username);
        const result = await submit(wallet, args.xUserId, requestId, operation);
        if (!/^0x[a-fA-F0-9]{64}$/.test(result.transactionHash)) throw new Error("signer returned an invalid transaction hash");
        if (result.status === "reverted") throw new Error("transaction reverted");
        const launchMetadata = command.kind === "launch" ? resolveLaunchMetadata(command, userContext.user.username) : undefined;
        const launchBase = command.kind === "launch" ? {
          ownerXUserId: args.xUserId, launchMode: command.launchMode, name: command.name,
          symbol: command.symbol, imageUri: String(operation.imageUri || ""),
          description: launchMetadata!.description, website: launchMetadata!.website,
          twitter: launchMetadata!.twitter, telegram: launchMetadata!.telegram,
          devBuyWei: result.valueWei || "0", tokenAddress: result.tokenAddress,
          poolAddress: result.poolAddress, positionId: result.positionId,
          devBuySucceeded: result.devBuySucceeded,
        } : undefined;
        if (result.status === "prepared") {
          if (!result.signedTransaction || !/^0x[a-fA-F0-9]+$/.test(result.signedTransaction)) throw new Error("signer returned an invalid prepared transaction");
          await ctx.runMutation(internal.wallets.recordPreparedExecution, {
            requestId, walletId: wallet._id, to: String(operation.recipient || operation.lockerAddress || operation.padAddress || operation.deadAddress || ""),
            valueWei: result.valueWei || "0", callKind: String(operation.type), transactionHash: result.transactionHash,
            signedTransaction: result.signedTransaction,
            launch: launchBase,
          });
          await ctx.runAction(internal.wallets.reconcileTransaction, { requestId });
          const reconciled = await ctx.runQuery(internal.wallets.getReconciliationContext, { requestId });
          if (reconciled?.request.status === "confirmed" && command.kind === "launch" && reconciled.launch?.tokenAddress) {
            const devBuy = command.devBuy ? ` dev buy: ${reconciled.launch.devBuySucceeded ? "successful" : "failed"}.` : "";
            return { ok: true, transactionHash: result.transactionHash, message: `${command.symbol} planted. contract: ${reconciled.launch.tokenAddress}.${devBuy} tx: ${transactionUrl(result.transactionHash)}.${warning}` };
          }
          if (reconciled?.request.status === "failed") throw new Error(reconciled.request.safeError || "transaction reverted");
          return { ok: true, transactionHash: result.transactionHash, message: `submitted to the roots: ${transactionUrl(result.transactionHash)}. confirmation is still growing.${warning}` };
        }
        if (result.status === "broadcast" || result.status === "pending") throw new Error("signer returned an unpersisted broadcast");
        if (command.kind === "launch" && (!result.tokenAddress || !safeAddress(result.tokenAddress))) {
          throw new Error("launch receipt did not contain a token address");
        }
        if (command.kind === "launch" && (!result.poolAddress || !safeAddress(result.poolAddress) || !result.positionId)) {
          throw new Error("launch receipt did not contain its curve position");
        }
        await ctx.runMutation(internal.wallets.recordConfirmedExecution, {
          requestId, walletId: wallet._id, to: String(operation.recipient || operation.lockerAddress || operation.padAddress || operation.deadAddress || ""),
          valueWei: result.valueWei || "0", callKind: String(operation.type), transactionHash: result.transactionHash,
          blockNumber: result.blockNumber, launch: launchBase,
        });
        if (command.kind === "launch") {
          const devBuy = command.devBuy ? ` dev buy: ${result.devBuySucceeded ? "successful" : "failed"}.` : "";
          return { ok: true, transactionHash: result.transactionHash, message: `${command.symbol} planted. contract: ${result.tokenAddress}.${devBuy} tx: ${transactionUrl(result.transactionHash)}.${warning}` };
        }
        if (command.kind === "buy" || command.kind === "sell") {
          return { ok: true, transactionHash: result.transactionHash, message: `${command.kind} confirmed: ${transactionUrl(result.transactionHash)}.${warning}` };
        }
        return { ok: true, transactionHash: result.transactionHash, message: `confirmed: ${transactionUrl(result.transactionHash)}.${warning}` };
      } catch (error) {
        if (command.kind === "sell" && error instanceof Error && /sell approval required/i.test(error.message)) {
          try {
            const approval = await submit(wallet, args.xUserId, requestId, {
              type: "erc20_approve_router", token: command.token, amount: command.amount, unit: command.unit, routerAddress: VERIFIED_SWAP_ROUTER,
            });
            if (approval.status !== "prepared" || !approval.signedTransaction || !/^0x[a-fA-F0-9]+$/.test(approval.signedTransaction)) {
              throw new Error("signer returned an invalid approval transaction");
            }
            await ctx.runMutation(internal.wallets.recordPreparedExecution, {
              requestId, walletId: wallet._id, to: command.token,
              valueWei: "0", callKind: "erc20_approve_router", transactionHash: approval.transactionHash,
              signedTransaction: approval.signedTransaction,
            });
            await ctx.runAction(internal.wallets.reconcileTransaction, { requestId });
            return {
              ok: true, transactionHash: approval.transactionHash,
              message: `router approval submitted: ${transactionUrl(approval.transactionHash)}. after it confirms, send the sell command again.${warning}`,
            };
          } catch (approvalError) {
            const approvalMessage = safeFailure(approvalError);
            await ctx.runMutation(internal.wallets.updateWalletRequest, { requestId, status: "failed", safeError: approvalMessage });
            return { ok: false, message: `${approvalMessage}.${warning}` };
          }
        }
        const message = safeFailure(error);
        await ctx.runMutation(internal.wallets.updateWalletRequest, { requestId, status: "failed", safeError: message });
        return { ok: false, message: `${message}.${warning}` };
      }
    }
    return { ok: false, message: "that wallet command is not available yet" };
  },
});

async function operationFor(
  command: Exclude<WalletCommand, { kind: "unknown" }>,
  mediaUrl?: string,
  claimToken?: string,
  recipientAddress?: string,
  launcherUsername?: string,
): Promise<Record<string, unknown>> {
  if (command.kind === "send") {
    const recipient = safeAddress(command.recipient) ? command.recipient : recipientAddress;
    if (!recipient || !safeAddress(recipient) || recipient.toLowerCase() === DEAD_ADDRESS.toLowerCase()) throw new Error("invalid transfer destination");
    return { type: command.unit === "token" ? "erc20_transfer" : "eth_transfer", recipient, amount: command.amount, unit: command.unit, token: command.token };
  }
  if (command.kind === "burn") {
    return { type: "erc20_burn_to_dead", deadAddress: DEAD_ADDRESS, amount: command.amount, unit: command.unit, token: command.token };
  }
  if (command.kind === "buy" || command.kind === "sell") {
    return {
      type: command.kind === "buy" ? "uniswap_v3_buy" : "uniswap_v3_sell",
      token: command.token, amount: command.amount, unit: command.unit, slippageBps: command.slippageBps,
      routerAddress: VERIFIED_SWAP_ROUTER, quoterAddress: VERIFIED_SWAP_QUOTER,
      wethAddress: VERIFIED_WETH, fee: 10_000,
    };
  }
  if (command.kind === "claim_fees") {
    if (!claimToken || !safeAddress(claimToken)) throw new Error("a verified launched token is required for the fee claim");
    return {
      type: "potatopad_creator_fee_claim",
      token: claimToken,
      padAddress: VERIFIED_CURVE_PAD,
      lockerAddress: VERIFIED_FEE_LOCKER,
      method: "collectAndClaim",
    };
  }
  if (command.kind === "launch") {
    const padAddress = process.env.POTATOPAD_CURVE_ADDRESS || VERIFIED_CURVE_PAD;
    if (!padAddress || !safeAddress(padAddress)) throw new Error("launch contract is not configured");
    if (!mediaUrl) throw new Error("a token launch requires an attached image");
    const imageUri = await normalizeImage(mediaUrl);
    const metadata = resolveLaunchMetadata(command, launcherUsername);
    return {
      type: "potatopad_launch", launchMode: command.launchMode, padAddress,
      name: command.name, symbol: command.symbol, imageUri,
      description: metadata.description,
      devBuy: command.devBuy || null,
      meta: {
        imageURI: imageUri,
        website: metadata.website,
        twitter: metadata.twitter,
        telegram: metadata.telegram,
      },
      method: "createToken",
      signature: "createToken(string,string,(string,string,string,string),bytes32)",
      valueSource: "dev_buy",
      saltSource: "deterministic_0x7a70_vanity_search",
      requireTokenCreatedEvent: true,
      requireCurveOpenedEvent: true,
      requireDevBuyEventWhenFunded: true,
      maxWalletBps: 200,
    };
  }
  throw new Error("operation is read-only");
}

function resolveLaunchMetadata(command: Extract<WalletCommand, { kind: "launch" }>, launcherUsername?: string) {
  const fallbackTwitter = launcherUsername ? `https://x.com/${launcherUsername.replace(/^@/, "")}` : "";
  return {
    description: command.description?.trim() || DEFAULT_LAUNCH_DESCRIPTION,
    website: optionalUrl(command.website || DEFAULT_LAUNCH_WEBSITE, "website"),
    twitter: optionalSocialUrl(command.twitter || fallbackTwitter, "twitter", ["x.com", "twitter.com"]),
    telegram: optionalSocialUrl(command.telegram, "telegram", ["t.me", "telegram.me"]),
  };
}

function optionalUrl(value: string | undefined, label: string) {
  if (!value) return "";
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error(`${label} must use https`);
  return url.toString();
}

function optionalSocialUrl(value: string | undefined, label: string, hosts: string[]) {
  const normalized = optionalUrl(value, label);
  if (!normalized) return "";
  const host = new URL(normalized).hostname.toLowerCase();
  if (!hosts.includes(host)) throw new Error(`${label} link uses an unsupported host`);
  return normalized;
}
