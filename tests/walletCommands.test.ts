import { describe, expect, it } from "vitest";
import { parseWalletCommand } from "../convex/walletCommands";

describe("X wallet commands", () => {
  it("defaults launches to the curve", () => {
    expect(parseWalletCommand('@0x7a70 plant "root static" ticker ROOT with a 0.02 eth dev buy')).toEqual({
      kind: "launch", launchMode: "curve", name: "root static", symbol: "ROOT",
      devBuy: { amount: "0.02", unit: "eth" },
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

  it("parses burns and creator fee claims", () => {
    expect(parseWalletCommand("burn 500 ROOT")).toEqual({ kind: "burn", amount: "500", unit: "token", token: "ROOT" });
    expect(parseWalletCommand("claim my fees for $ROOT")).toEqual({ kind: "claim_fees", token: "ROOT" });
  });
});
