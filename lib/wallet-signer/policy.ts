import { createHash } from "node:crypto";
import { z } from "zod";

export const ROBINHOOD_CHAIN_ID = 4663;
export const ROBINHOOD_RPC_URL = "https://rpc.mainnet.chain.robinhood.com";
export const POTATOPAD_CURVE_ADDRESS = "0xbE2aCD9044516399aa4C697c299571664fBe9d4B";
export const POTATOPAD_LOCKER_ADDRESS = "0x47eC8916647007c66985aa316f70C44Dd41D75EB";
export const DEAD_ADDRESS = "0x000000000000000000000000000000000000dEaD";
export const X7A70_TOKEN_ADDRESS = "0x7A701D2cA3274fA1a3BED634D5e9Fcd8E041693f";
export const ROBINHOOD_WETH_ADDRESS = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
export const UNISWAP_V3_ROUTER_ADDRESS = "0xcaf681a66d020601342297493863e78c959e5cb2";
export const UNISWAP_V3_QUOTER_ADDRESS = "0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7";
export const POTATOPAD_POOL_FEE = 10_000;
export const MAX_LAUNCH_DEV_BUY_WEI = 26_270_000_000_000_000n;

const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const decimal = z.string().regex(/^\d+(?:\.\d+)?$/).max(80);
const amount = z.object({ amount: decimal, unit: z.enum(["eth", "usd"]) });

export const walletRequestSchema = z.object({
  idempotencyKey: z.string().min(4).max(180), ownerReference: z.string().regex(/^x:\d{1,30}$/),
  chainId: z.literal(ROBINHOOD_CHAIN_ID),
}).strict();

export const balanceRequestSchema = z.object({
  chainId: z.literal(ROBINHOOD_CHAIN_ID), walletRef: address, expectedAddress: address,
  ownerReference: z.string().regex(/^x:\d{1,30}$/), token: z.string().min(1).max(50),
}).strict();

const commonExecution = z.object({
  idempotencyKey: z.string().min(8).max(180), chainId: z.literal(ROBINHOOD_CHAIN_ID),
  ownerReference: z.string().regex(/^x:\d{1,30}$/), walletRef: address,
  expectedFrom: address, requireSimulation: z.literal(true),
});

const operationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("eth_transfer"), recipient: address, amount: decimal, unit: z.enum(["eth", "usd", "percent"]), token: z.unknown().optional() }).strict(),
  z.object({ type: z.literal("erc20_transfer"), recipient: address, amount: decimal, unit: z.enum(["token", "usd", "percent"]), token: z.string().min(1).max(50) }).strict(),
  z.object({ type: z.literal("erc20_burn_to_dead"), deadAddress: address, amount: decimal, unit: z.enum(["token", "usd", "percent"]), token: z.string().min(1).max(50) }).strict(),
  z.object({ type: z.literal("erc20_approve_router"), token: z.string().min(1).max(50), amount: decimal, unit: z.enum(["token", "percent"]), routerAddress: z.literal(UNISWAP_V3_ROUTER_ADDRESS) }).strict(),
  z.object({
    type: z.literal("uniswap_v3_buy"), token: z.string().min(1).max(50), amount: decimal,
    unit: z.enum(["eth", "usd"]), slippageBps: z.number().int().min(10).max(2_000),
    routerAddress: z.literal(UNISWAP_V3_ROUTER_ADDRESS), quoterAddress: z.literal(UNISWAP_V3_QUOTER_ADDRESS),
    wethAddress: z.literal(ROBINHOOD_WETH_ADDRESS), fee: z.literal(POTATOPAD_POOL_FEE),
  }).strict(),
  z.object({
    type: z.literal("uniswap_v3_sell"), token: z.string().min(1).max(50), amount: decimal,
    unit: z.enum(["token", "percent"]), slippageBps: z.number().int().min(10).max(2_000),
    routerAddress: z.literal(UNISWAP_V3_ROUTER_ADDRESS), quoterAddress: z.literal(UNISWAP_V3_QUOTER_ADDRESS),
    wethAddress: z.literal(ROBINHOOD_WETH_ADDRESS), fee: z.literal(POTATOPAD_POOL_FEE),
  }).strict(),
  z.object({
    type: z.literal("potatopad_creator_fee_claim"), token: address,
    padAddress: z.literal(POTATOPAD_CURVE_ADDRESS), lockerAddress: z.literal(POTATOPAD_LOCKER_ADDRESS),
    method: z.literal("collectAndClaim"),
  }).strict(),
  z.object({
    type: z.literal("potatopad_launch"), launchMode: z.literal("curve"), padAddress: address,
    name: z.string().min(1).max(48), symbol: z.string().regex(/^[A-Z0-9]{1,12}$/),
    imageUri: z.string().url().max(2048), description: z.string().max(280), devBuy: amount.nullable(),
    meta: z.object({ imageURI: z.string().url().max(2048), website: z.string().max(2048), twitter: z.string().max(2048), telegram: z.string().max(2048) }).strict(),
    method: z.literal("createToken"), signature: z.literal("createToken(string,string,(string,string,string,string),bytes32)"),
    valueSource: z.literal("dev_buy"), saltSource: z.literal("deterministic_0x7a70_vanity_search"),
    requireTokenCreatedEvent: z.literal(true), requireCurveOpenedEvent: z.literal(true),
    requireDevBuyEventWhenFunded: z.literal(true), maxWalletBps: z.literal(200),
  }).strict(),
]);

export const executionRequestSchema = commonExecution.extend({ operation: operationSchema }).strict();
export type ExecutionRequest = z.infer<typeof executionRequestSchema>;

export const transactionStatusRequestSchema = z.object({
  chainId: z.literal(ROBINHOOD_CHAIN_ID),
  ownerReference: z.string().regex(/^x:\d{1,30}$/),
  walletRef: address,
  expectedFrom: address,
  transactionHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  operationType: z.enum(["eth_transfer", "erc20_transfer", "erc20_burn_to_dead", "erc20_approve_router", "uniswap_v3_buy", "uniswap_v3_sell", "potatopad_launch", "potatopad_creator_fee_claim"]),
  expectedValueWei: z.string().regex(/^\d+$/),
}).strict();
export type TransactionStatusRequest = z.infer<typeof transactionStatusRequestSchema>;

export const broadcastRequestSchema = transactionStatusRequestSchema.extend({
  signedTransaction: z.string().regex(/^0x[a-fA-F0-9]+$/).max(50_000),
}).strict();
export type BroadcastRequest = z.infer<typeof broadcastRequestSchema>;

export function accountName(ownerReference: string) {
  return `x7a70-x-${createHash("sha256")
    .update(ownerReference)
    .digest("hex")
    .slice(0, 24)}`;
}

export function resolveTokenAddress(token: string) {
  if (/^0x[a-fA-F0-9]{40}$/.test(token)) return token as `0x${string}`;
  if (/^\$?0x7a70$/i.test(token)) return X7A70_TOKEN_ADDRESS as `0x${string}`;
  throw new Error("token must be an exact contract address or $0x7a70");
}
