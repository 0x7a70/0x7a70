import { describe, expect, it } from "vitest";
import { parseWalletCommand } from "../convex/walletCommands";

describe("X wallet commands", () => {
  it("parses buys with default and custom slippage", () => {
    expect(parseWalletCommand("@0x7a70 buy $25 of $0x7a70")).toEqual({ kind: "buy", amount: "25", unit: "usd", token: "0x7a70", slippageBps: 250 });
    expect(parseWalletCommand("buy 0.02 eth of 0x7A701D2cA3274fA1a3BED634D5e9Fcd8E041693f slippage 2.5%")).toEqual({
      kind: "buy", amount: "0.02", unit: "eth", token: "0x7A701D2cA3274fA1a3BED634D5e9Fcd8E041693f", slippageBps: 250,
    });
  });

  it("parses token sells and bounds slippage", () => {
    expect(parseWalletCommand("sell 1200 $0x7a70")).toEqual({ kind: "sell", amount: "1200", unit: "token", token: "0x7a70", slippageBps: 250 });
    expect(parseWalletCommand("sell 3.5 of ROOT with slippage 30%")).toEqual({ kind: "unknown", reason: "Slippage must be between 0.1% and 20%." });
  });
  it("defaults launches to the curve", () => {
    expect(parseWalletCommand('@0x7a70 plant "root static" ticker ROOT with a 0.02 eth dev buy')).toEqual({
      kind: "launch", launchMode: "curve", name: "root static", symbol: "ROOT",
      devBuy: { amount: "0.02", unit: "eth" },
    });
  });

  it("enforces the initial dev-buy maximum", () => {
    expect(parseWalletCommand('launch "cap test" ticker CAP with 0.02627 eth dev buy')).toMatchObject({
      kind: "launch", devBuy: { amount: "0.02627", unit: "eth" },
    });
    expect(parseWalletCommand('launch "cap test" ticker CAP with 0.02628 eth dev buy')).toEqual({
      kind: "unknown", reason: "The maximum initial dev buy is 0.02627 ETH.",
    });
  });

  it("keeps every launch on the initial curve creation path", () => {
    expect(parseWalletCommand("launch a token called Small Root, ticker ROOT")).toMatchObject({
      kind: "launch", launchMode: "curve",
    });
  });

  it("parses optional PotatoPad metadata", () => {
    expect(parseWalletCommand('plant "night tuber" ticker NIGHT description "a quiet potato beneath the moon" website: https://night.example x: https://x.com/nightroot tg: https://t.me/nightroot')).toMatchObject({
      kind: "launch",
      name: "night tuber",
      symbol: "NIGHT",
      description: "a quiet potato beneath the moon",
      website: "https://night.example",
      twitter: "https://x.com/nightroot",
      telegram: "https://t.me/nightroot",
    });
    expect(parseWalletCommand('plant token named Night Tuber ticker NIGHT description "a quiet potato beneath the moon"')).toMatchObject({
      kind: "launch",
      name: "Night Tuber",
      description: "a quiet potato beneath the moon",
    });
  });

  it("accepts USD and ETH sends", () => {
    const recipient = "0x1111111111111111111111111111111111111111";
    expect(parseWalletCommand(`send $12 of eth to ${recipient}`)).toMatchObject({ kind: "send", amount: "12", unit: "usd", recipient });
    expect(parseWalletCommand(`transfer 0.03 eth to ${recipient}`)).toMatchObject({ kind: "send", amount: "0.03", unit: "eth", recipient });
  });

  it("accepts an X handle as a transfer recipient", () => {
    expect(parseWalletCommand("@0x7a70 send 0.03 eth to @rootfriend")).toMatchObject({
      kind: "send", amount: "0.03", unit: "eth", recipient: "@rootfriend",
    });
    expect(parseWalletCommand("send @rootfriend 25 ROOT")).toMatchObject({
      kind: "send", amount: "25", unit: "token", token: "ROOT", recipient: "@rootfriend",
    });
  });

  it("parses burns and creator fee claims", () => {
    expect(parseWalletCommand("burn 500 ROOT")).toEqual({ kind: "burn", amount: "500", unit: "token", token: "ROOT" });
    expect(parseWalletCommand("claim my fees for $ROOT")).toEqual({ kind: "claim_fees", token: "ROOT" });
  });

  it("accepts USD-denominated burns", () => {
    expect(parseWalletCommand("burn $25 of $0x7a70")).toEqual({ kind: "burn", amount: "25", unit: "usd", token: "0x7a70" });
    expect(parseWalletCommand("burn 10 usd worth of ROOT")).toEqual({ kind: "burn", amount: "10", unit: "usd", token: "ROOT" });
  });

  it("accepts all, half, and percentage balance amounts", () => {
    expect(parseWalletCommand("sell all of my $0x7a70")).toEqual({ kind: "sell", amount: "100", unit: "percent", token: "0x7a70", slippageBps: 250 });
    expect(parseWalletCommand("burn half of my ROOT")).toEqual({ kind: "burn", amount: "50", unit: "percent", token: "ROOT" });
    expect(parseWalletCommand("@0x7a70 send 12.5% of my ROOT to @recipient")).toEqual({
      kind: "send", amount: "12.5", unit: "percent", token: "ROOT", recipient: "@recipient",
    });
  });
});
