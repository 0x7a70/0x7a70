import { describe, expect, it } from "vitest";
import { accountName, executionRequestSchema, resolveTokenAddress, X7A70_TOKEN_ADDRESS } from "../lib/wallet-signer/policy";

describe("wallet signer policy", () => {
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
      balancePolicy: { nativeAsset: "ETH", minimumEndingBalanceUsd: "0.50", quoteAtExecution: true, includeMaximumGasCost: true, failClosedWhenQuoteUnavailable: true },
      operation: { type: "arbitrary_calldata", to: "0x2222222222222222222222222222222222222222", data: "0xdeadbeef" },
    })).toThrow();
  });
});
