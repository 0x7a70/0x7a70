import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { isValueMovingCommand, parseWalletCommand, type WalletCommand } from "./walletCommands";

const ROBINHOOD_CHAIN_ID = 4663;
const NON_PREMIUM_DAILY_LIMIT = 10;
const DEAD_ADDRESS = "0x000000000000000000000000000000000000dEaD";
const VERIFIED_CURVE_PAD = "0xbE2aCD9044516399aa4C697c299571664fBe9d4B";
const DEFAULT_GAS_RESERVE_USD = "0.50";
const ROBINHOOD_EXPLORER_TX_BASE = "https://robinhoodchain.blockscout.com/tx";

type SignerWallet = { walletRef: string; address: string };
type SubmittedTransaction = {
  transactionHash: string;
  status: "confirmed" | "reverted";
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
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || `signer request failed (${response.status})`);
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

export const beginWalletProvisioning = internalMutation({
  args: { xUserId: v.string() },
  handler: async (ctx, { xUserId }) => {
    const user = await ctx.db.query("xReplyUsers").withIndex("by_x_user_id", (q) => q.eq("xUserId", xUserId)).unique();
    if (!user) throw new Error("X user is not registered");
    if (user.walletId) return { needed: false, walletId: user.walletId };
    if (user.walletStatus === "provisioning") return { needed: false };
    await ctx.db.patch(user._id, { walletStatus: "provisioning", updatedAt: Date.now() });
    return { needed: true };
  },
});

export const finishWalletProvisioning = internalMutation({
  args: { xUserId: v.string(), address: v.string(), signerWalletRef: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db.query("xReplyUsers").withIndex("by_x_user_id", (q) => q.eq("xUserId", args.xUserId)).unique();
    if (!user) throw new Error("X user is not registered");
    const existing = await ctx.db.query("cryptoWallets").withIndex("by_owner_x_user_id", (q) => q.eq("ownerXUserId", args.xUserId)).unique();
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
    if (args.premium) return { allowed: true, count: 0, remaining: null as number | null };
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    const record = await ctx.db.query("walletRateLimits").withIndex("by_owner_x_user_id", (q) => q.eq("ownerXUserId", args.xUserId)).unique();
    const current = record?.day === day ? record.count : 0;
    if (current >= NON_PREMIUM_DAILY_LIMIT) return { allowed: false, count: current, remaining: 0 };
    const count = current + 1;
    if (record) await ctx.db.patch(record._id, { day, count, updatedAt: now });
    else await ctx.db.insert("walletRateLimits", { ownerXUserId: args.xUserId, day, count, updatedAt: now });
    return { allowed: true, count, remaining: NON_PREMIUM_DAILY_LIMIT - count };
  },
});

export const reserveWalletRequest = internalMutation({
  args: { requestId: v.string(), sourcePostId: v.string(), ownerXUserId: v.string(), walletId: v.id("cryptoWallets"), kind: v.string(), normalizedJson: v.string() },
  handler: async (ctx, args) => {
    const duplicate = await ctx.db.query("walletRequests").withIndex("by_request_id", (q) => q.eq("requestId", args.requestId)).unique();
    if (duplicate) return { inserted: false, request: duplicate };
    const now = Date.now();
    const id = await ctx.db.insert("walletRequests", { ...args, status: "accepted", createdAt: now, updatedAt: now });
    return { inserted: true, request: await ctx.db.get(id) };
  },
});

export const updateWalletRequest = internalMutation({
  args: {
    requestId: v.string(),
    status: v.union(v.literal("accepted"), v.literal("simulating"), v.literal("broadcast"), v.literal("confirmed"), v.literal("rejected"), v.literal("failed")),
    safeError: v.optional(v.string()), transactionHash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.query("walletRequests").withIndex("by_request_id", (q) => q.eq("requestId", args.requestId)).unique();
    if (request) await ctx.db.patch(request._id, { status: args.status, safeError: args.safeError, transactionHash: args.transactionHash, updatedAt: Date.now() });
  },
});

export const recordConfirmedExecution = internalMutation({
  args: {
    requestId: v.string(), walletId: v.id("cryptoWallets"), to: v.string(), valueWei: v.string(),
    callKind: v.string(), transactionHash: v.string(), blockNumber: v.optional(v.string()),
    launch: v.optional(v.object({
      ownerXUserId: v.string(), launchMode: v.literal("curve"),
      name: v.string(), symbol: v.string(), imageUri: v.string(), devBuyWei: v.string(),
      description: v.optional(v.string()), website: v.optional(v.string()),
      twitter: v.optional(v.string()), telegram: v.optional(v.string()),
      tokenAddress: v.optional(v.string()), poolAddress: v.optional(v.string()),
      positionId: v.optional(v.string()), devBuySucceeded: v.optional(v.boolean()),
    })),
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
    if (args.launch) {
      const launch = await ctx.db.query("tokenLaunches").withIndex("by_request_id", (q) => q.eq("requestId", args.requestId)).unique();
      if (!launch) await ctx.db.insert("tokenLaunches", {
        requestId: args.requestId, walletId: args.walletId, transactionHash: args.transactionHash,
        ...args.launch, createdAt: now, updatedAt: now,
      });
    }
    const request = await ctx.db.query("walletRequests").withIndex("by_request_id", (q) => q.eq("requestId", args.requestId)).unique();
    if (request) await ctx.db.patch(request._id, { status: "confirmed", transactionHash: args.transactionHash, updatedAt: now });
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
    if (current?.wallet) return current.wallet;
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
  args: { sourcePostId: v.string(), xUserId: v.string(), text: v.string(), mediaUrl: v.optional(v.string()) },
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
      return { ok: true, message: `robinhood chain wallet: ${wallet.address}` };
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
      const limit = await ctx.runMutation(internal.wallets.consumeWalletLimit, {
        xUserId: args.xUserId, premium: isPremium(userContext.user.subscriptionType),
      });
      if (!limit.allowed) {
        await ctx.runMutation(internal.wallets.updateWalletRequest, { requestId, status: "rejected", safeError: "daily wallet limit reached" });
        return { ok: false, message: "today's 10 wallet actions have already been used" };
      }
      const warning = limit.remaining === 2 ? " 2 wallet actions remain today." : limit.remaining === 1 ? " 1 wallet action remains today." : limit.remaining === 0 ? " today's wallet limit is now exhausted." : "";
      try {
        await ctx.runMutation(internal.wallets.updateWalletRequest, { requestId, status: "simulating" });
        const operation = await operationFor(command, args.mediaUrl, args.sourcePostId);
        const result = await submit(wallet, args.xUserId, requestId, operation);
        if (!/^0x[a-fA-F0-9]{64}$/.test(result.transactionHash)) throw new Error("signer returned an invalid transaction hash");
        if (result.status !== "confirmed") throw new Error("transaction reverted");
        if (command.kind === "launch" && (!result.tokenAddress || !safeAddress(result.tokenAddress))) {
          throw new Error("launch receipt did not contain a token address");
        }
        if (command.kind === "launch" && (!result.poolAddress || !safeAddress(result.poolAddress) || !result.positionId)) {
          throw new Error("launch receipt did not contain its curve position");
        }
        const launch = command.kind === "launch" ? {
          ownerXUserId: args.xUserId, launchMode: command.launchMode, name: command.name,
          symbol: command.symbol, imageUri: String(operation.imageUri || ""),
          description: command.description, website: command.website,
          twitter: command.twitter, telegram: command.telegram,
          devBuyWei: result.valueWei || "0", tokenAddress: result.tokenAddress,
          poolAddress: result.poolAddress, positionId: result.positionId,
          devBuySucceeded: result.devBuySucceeded,
        } : undefined;
        await ctx.runMutation(internal.wallets.recordConfirmedExecution, {
          requestId, walletId: wallet._id, to: String(operation.recipient || operation.padAddress || operation.deadAddress || ""),
          valueWei: result.valueWei || "0", callKind: String(operation.type), transactionHash: result.transactionHash,
          blockNumber: result.blockNumber, launch,
        });
        if (command.kind === "launch") {
          const devBuy = command.devBuy ? ` dev buy: ${result.devBuySucceeded ? "successful" : "failed"}.` : "";
          return { ok: true, transactionHash: result.transactionHash, message: `${command.symbol} planted. contract: ${result.tokenAddress}.${devBuy} tx: ${transactionUrl(result.transactionHash)}.${warning}` };
        }
        return { ok: true, transactionHash: result.transactionHash, message: `confirmed: ${transactionUrl(result.transactionHash)}.${warning}` };
      } catch (error) {
        const message = safeFailure(error);
        await ctx.runMutation(internal.wallets.updateWalletRequest, { requestId, status: "failed", safeError: message });
        return { ok: false, message: `${message}.${warning}` };
      }
    }
    return { ok: false, message: "that wallet command is not available yet" };
  },
});

async function operationFor(command: Exclude<WalletCommand, { kind: "unknown" }>, mediaUrl?: string, sourcePostId?: string): Promise<Record<string, unknown>> {
  if (command.kind === "send") {
    if (!safeAddress(command.recipient) || command.recipient.toLowerCase() === DEAD_ADDRESS.toLowerCase()) throw new Error("invalid transfer destination");
    return { type: command.unit === "token" ? "erc20_transfer" : "eth_transfer", recipient: command.recipient, amount: command.amount, unit: command.unit, token: command.token };
  }
  if (command.kind === "burn") {
    return { type: "erc20_burn_to_dead", deadAddress: DEAD_ADDRESS, amount: command.amount, token: command.token };
  }
  if (command.kind === "claim_fees") {
    return {
      type: "potatopad_creator_fee_claim",
      token: command.token,
      resolveLaunch: "token_created_event",
      deriveLockerFromPad: true,
      sequence: ["collect_position", "claim_weth", "claim_token_if_applicable"],
    };
  }
  if (command.kind === "launch") {
    const padAddress = process.env.POTATOPAD_CURVE_ADDRESS || VERIFIED_CURVE_PAD;
    if (!padAddress || !safeAddress(padAddress)) throw new Error("launch contract is not configured");
    if (!mediaUrl) throw new Error("a token launch requires an attached image");
    const imageUri = await normalizeImage(mediaUrl);
    const website = optionalUrl(command.website, "website");
    const twitter = optionalSocialUrl(command.twitter, "twitter", ["x.com", "twitter.com"]);
    const telegram = optionalSocialUrl(command.telegram, "telegram", ["t.me", "telegram.me"]);
    return {
      type: "potatopad_launch", launchMode: command.launchMode, padAddress,
      name: command.name, symbol: command.symbol, imageUri,
      description: command.description || "",
      devBuy: command.devBuy || null,
      meta: {
        imageURI: imageUri,
        website,
        twitter: twitter || (sourcePostId ? `https://x.com/i/web/status/${sourcePostId}` : ""),
        telegram,
      },
      method: "createToken",
      signature: "createToken(string,string,(string,string,string,string),bytes32)",
      valueSource: "dev_buy",
      saltSource: "secure_random_bytes32",
      requireTokenCreatedEvent: true,
      requireCurveOpenedEvent: true,
      requireDevBuyEventWhenFunded: true,
      maxWalletBps: 200,
    };
  }
  throw new Error("operation is read-only");
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
