import { describe, expect, it } from "vitest";
import {
  accountName,
  broadcastRequestSchema,
  executionRequestSchema,
  resolveTokenAddress,
  transactionStatusRequestSchema,
  X7A70_TOKEN_ADDRESS,
} from "../lib/wallet-signer/policy";

describe("wallet signer policy", () => {
  it("allows only the verified router configuration for buys and sells", () => {
    const common = {
      idempotencyKey: "x:123:swap:1", chainId: 4663 as const, ownerReference: "x:123",
      walletRef: "0x1111111111111111111111111111111111111111", expectedFrom: "0x1111111111111111111111111111111111111111",
      requireSimulation: true as const,
    };
    const buy = {
      type: "uniswap_v3_buy" as const, token: "$0x7a70", amount: "10", unit: "usd" as const, slippageBps: 500,
      routerAddress: "0xcaf681a66d020601342297493863e78c959e5cb2" as const,
      quoterAddress: "0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7" as const,
      wethAddress: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73" as const, fee: 10_000 as const,
    };
    expect(executionRequestSchema.parse({ ...common, operation: buy }).operation.type).toBe("uniswap_v3_buy");
    expect(executionRequestSchema.parse({ ...common, operation: { ...buy, type: "uniswap_v3_sell", amount: "100", unit: "token" } }).operation.type).toBe("uniswap_v3_sell");
    expect(() => executionRequestSchema.parse({ ...common, operation: { ...buy, slippageBps: 2500 } })).toThrow();
    expect(() => executionRequestSchema.parse({ ...common, operation: { ...buy, routerAddress: "0x2222222222222222222222222222222222222222" } })).toThrow();
  });
  it("derives stable opaque CDP account names", () => {
    expect(accountName("x:123")).toBe(accountName("x:123"));
    expect(accountName("x:123")).not.toContain("123");
  });

  it("only resolves exact token identifiers", () => {
    expect(resolveTokenAddress("$0x7a70")).toBe(X7A70_TOKEN_ADDRESS);
    expect(() => resolveTokenAddress("ROOT")).toThrow(/exact contract/);
  });

  it("rejects arbitrary execution operations", () => {
    expect(() => executionRequestSchema.parse({
      idempotencyKey: "x:123:send", chainId: 4663,
      ownerReference: "x:123",
      walletRef: "0x1111111111111111111111111111111111111111",
      expectedFrom: "0x1111111111111111111111111111111111111111",
      requireSimulation: true,
      operation: { type: "arbitrary_calldata", to: "0x2222222222222222222222222222222222222222", data: "0xdeadbeef" },
    })).toThrow();
  });

  it("binds broadcast recovery to an owner, wallet, operation, and transaction hash", () => {
    const base = {
      chainId: 4663 as const,
      ownerReference: "x:123",
      walletRef: "0x1111111111111111111111111111111111111111",
      expectedFrom: "0x1111111111111111111111111111111111111111",
      transactionHash: `0x${"ab".repeat(32)}`,
      operationType: "eth_transfer" as const,
      expectedValueWei: "1",
    };

    expect(transactionStatusRequestSchema.parse(base)).toEqual(base);
    expect(broadcastRequestSchema.parse({ ...base, signedTransaction: "0xdeadbeef" }).signedTransaction).toBe("0xdeadbeef");
    expect(() => broadcastRequestSchema.parse({ ...base, chainId: 1, signedTransaction: "0xdeadbeef" })).toThrow();
    expect(() => transactionStatusRequestSchema.parse({ ...base, ownerReference: "anonymous" })).toThrow();
  });

  it("allows fee claims only through the verified pad and locker", () => {
    const common = {
      idempotencyKey: "x:123:claim:1",
      chainId: 4663 as const,
      ownerReference: "x:123",
      walletRef: "0x1111111111111111111111111111111111111111",
      expectedFrom: "0x1111111111111111111111111111111111111111",
      requireSimulation: true as const,
    };
    const operation = {
      type: "potatopad_creator_fee_claim" as const,
      token: X7A70_TOKEN_ADDRESS,
      padAddress: "0xbE2aCD9044516399aa4C697c299571664fBe9d4B" as const,
      lockerAddress: "0x47eC8916647007c66985aa316f70C44Dd41D75EB" as const,
      method: "collectAndClaim" as const,
    };
    expect(executionRequestSchema.parse({ ...common, operation }).operation.type).toBe("potatopad_creator_fee_claim");
    expect(() => executionRequestSchema.parse({ ...common, operation: { ...operation, lockerAddress: "0x2222222222222222222222222222222222222222" } })).toThrow();
  });

  it("accepts launches without an image while retaining attached image URLs", () => {
    const common = {
      idempotencyKey: "x:123:launch:1", chainId: 4663 as const, ownerReference: "x:123",
      walletRef: "0x1111111111111111111111111111111111111111", expectedFrom: "0x1111111111111111111111111111111111111111",
      requireSimulation: true as const,
    };
    const operation = {
      type: "potatopad_launch" as const, launchMode: "curve" as const,
      padAddress: "0xbE2aCD9044516399aa4C697c299571664fBe9d4B", name: "Potato Seed", symbol: "SEED",
      imageUri: "", description: "", devBuy: null,
      meta: { imageURI: "", website: "", twitter: "", telegram: "" }, method: "createToken" as const,
      signature: "createToken(string,string,(string,string,string,string),bytes32)" as const,
      valueSource: "dev_buy" as const, saltSource: "deterministic_0x7a70_vanity_search" as const,
      requireTokenCreatedEvent: true as const, requireCurveOpenedEvent: true as const,
      requireDevBuyEventWhenFunded: true as const, maxWalletBps: 200 as const,
    };
    expect(executionRequestSchema.parse({ ...common, operation }).operation.type).toBe("potatopad_launch");
    expect(executionRequestSchema.parse({ ...common, operation: { ...operation, imageUri: "https://pbs.twimg.com/media/test.png", meta: { ...operation.meta, imageURI: "https://pbs.twimg.com/media/test.png" } } }).operation.type).toBe("potatopad_launch");
  });
});
